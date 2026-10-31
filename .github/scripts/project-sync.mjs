// Moves issues across the project board's Status column.
//
//   issue opened / reopened     -> Backlog, or Ready if it has a milestone
//   milestone added             -> Ready        (from Backlog)
//   milestone removed           -> Backlog      (from Ready)
//   branch <type>/<issue>-…     -> In progress  (from Backlog, Ready)
//   draft PR opened             -> In progress
//   PR ready for review         -> In review
//   PR closed without merge     -> Ready        (from In progress, In review)
//   PR merged                   -> Done for the issues it closes,
//                                  In progress for those linked by branch only
//   issue closed                -> Done
//
// PRs reach their issues through closing keywords ("Closes #12") and through
// the branch name. An issue in Done only leaves it when it is reopened.

const STATUS = {
	backlog: 'Backlog',
	ready: 'Ready',
	progress: 'In progress',
	review: 'In review',
	done: 'Done',
};

const BRANCH = /^[a-z]+\/(\d+)-/;

export default async function sync({ github, context, core, owner, number }) {
	const board = await loadBoard(github, owner, number);
	const { eventName, payload } = context;

	const move = async (issueId, status, { from } = {}) => {
		const item = await findOrAddItem(github, board, issueId);
		const current = item.status;
		if (current === status) return;
		if (current === STATUS.done && status !== STATUS.done && !from?.includes(STATUS.done)) {
			core.info(`Issue ${issueId} is Done, left untouched`);
			return;
		}
		if (from && current && !from.includes(current)) {
			core.info(`Issue ${issueId} is ${current}, not moved to ${status}`);
			return;
		}
		await setStatus(github, board, item.id, status);
		core.info(`Issue ${issueId}: ${current ?? 'none'} -> ${status}`);
	};

	if (eventName === 'issues') {
		const { issue, action } = payload;
		const initial = issue.milestone ? STATUS.ready : STATUS.backlog;
		switch (action) {
			case 'opened':
				return move(issue.node_id, initial);
			case 'reopened':
				return move(issue.node_id, initial, { from: [STATUS.done] });
			case 'milestoned':
				return move(issue.node_id, STATUS.ready, { from: [STATUS.backlog] });
			case 'demilestoned':
				return move(issue.node_id, STATUS.backlog, { from: [STATUS.ready] });
			case 'closed':
				return move(issue.node_id, STATUS.done);
		}
		return;
	}

	if (eventName === 'create') {
		if (payload.ref_type !== 'branch') return;
		const issue = await issueFromBranch(github, context, payload.ref);
		if (issue?.state === 'open')
			await move(issue.node_id, STATUS.progress, { from: [STATUS.backlog, STATUS.ready] });
		return;
	}

	if (eventName === 'pull_request_target') {
		const { pull_request: pr, action } = payload;
		// Only work PRs into the default branch move issues; dev -> main is a delivery
		if (pr.base.ref !== payload.repository.default_branch) return;

		const issues = await linkedIssues(github, context, pr);
		if (!issues.length) {
			core.info('No linked issue');
			return;
		}

		for (const issue of issues) {
			if (action === 'closed') {
				if (pr.merged && issue.closes) await move(issue.id, STATUS.done);
				else if (issue.state === 'OPEN')
					// A merged PR that does not close its issue leaves work to do
					await move(issue.id, pr.merged ? STATUS.progress : STATUS.ready, {
						from: [STATUS.progress, STATUS.review],
					});
				continue;
			}
			if (issue.state !== 'OPEN') continue;
			const status = pr.draft ? STATUS.progress : STATUS.review;
			await move(issue.id, status, {
				from: [STATUS.backlog, STATUS.ready, STATUS.progress, STATUS.review],
			});
		}
	}
}

async function loadBoard(github, owner, number) {
	const { user } = await github.graphql(
		`query ($owner: String!, $number: Int!) {
			user(login: $owner) {
				projectV2(number: $number) {
					id
					field(name: "Status") {
						... on ProjectV2SingleSelectField { id options { id name } }
					}
				}
			}
		}`,
		{ owner, number },
	);
	const project = user?.projectV2;
	if (!project?.field) throw new Error(`Project ${owner}/${number} or its Status field not found`);

	const options = Object.fromEntries(project.field.options.map((o) => [o.name, o.id]));
	for (const name of Object.values(STATUS))
		if (!options[name]) throw new Error(`Status option "${name}" is missing on the board`);

	return { id: project.id, fieldId: project.field.id, options };
}

async function findOrAddItem(github, board, contentId) {
	const { node } = await github.graphql(
		`query ($id: ID!) {
			node(id: $id) {
				... on Issue {
					projectItems(first: 20) {
						nodes {
							id
							project { id }
							fieldValueByName(name: "Status") {
								... on ProjectV2ItemFieldSingleSelectValue { name }
							}
						}
					}
				}
			}
		}`,
		{ id: contentId },
	);
	const existing = node?.projectItems?.nodes.find((i) => i.project.id === board.id);
	if (existing) return { id: existing.id, status: existing.fieldValueByName?.name };

	const { addProjectV2ItemById } = await github.graphql(
		`mutation ($project: ID!, $content: ID!) {
			addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
		}`,
		{ project: board.id, content: contentId },
	);
	return { id: addProjectV2ItemById.item.id, status: undefined };
}

async function setStatus(github, board, itemId, status) {
	await github.graphql(
		`mutation ($project: ID!, $item: ID!, $field: ID!, $option: String!) {
			updateProjectV2ItemFieldValue(input: {
				projectId: $project, itemId: $item, fieldId: $field,
				value: { singleSelectOptionId: $option }
			}) { projectV2Item { id } }
		}`,
		{ project: board.id, item: itemId, field: board.fieldId, option: board.options[status] },
	);
}

async function issueFromBranch(github, context, branch) {
	const number = Number(branch.match(BRANCH)?.[1]);
	if (!number) return undefined;
	try {
		const { data } = await github.rest.issues.get({ ...context.repo, issue_number: number });
		return data.pull_request ? undefined : data;
	} catch (error) {
		if (error.status === 404) return undefined;
		throw error;
	}
}

async function linkedIssues(github, context, pr) {
	const { repository } = await github.graphql(
		`query ($owner: String!, $repo: String!, $number: Int!) {
			repository(owner: $owner, name: $repo) {
				pullRequest(number: $number) {
					closingIssuesReferences(first: 10) { nodes { id number state } }
				}
			}
		}`,
		{ ...context.repo, number: pr.number },
	);
	const issues = repository.pullRequest.closingIssuesReferences.nodes.map((issue) => ({
		...issue,
		closes: true,
	}));

	const fromBranch = await issueFromBranch(github, context, pr.head.ref);
	if (fromBranch && !issues.some((i) => i.number === fromBranch.number))
		issues.push({
			id: fromBranch.node_id,
			number: fromBranch.number,
			state: fromBranch.state.toUpperCase(),
			closes: false,
		});

	return issues;
}
