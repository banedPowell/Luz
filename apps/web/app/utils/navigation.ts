export interface NavigationEntry {
	label: string;
	icon: string;
	to: string;
	// The sidebar lists the sections at the top and keeps Settings at the bottom,
	// where the account menu will join it (docs/design/interface-principles.md)
	placement: 'main' | 'footer';
}

export const navigationEntries: readonly NavigationEntry[] = [
	{ label: 'Home', icon: 'i-pixelarticons-home', to: '/', placement: 'main' },
	{ label: 'Library', icon: 'i-pixelarticons-library', to: '/library', placement: 'main' },
	{ label: 'Downloads', icon: 'i-pixelarticons-download', to: '/downloads', placement: 'main' },
	{
		label: 'Settings',
		icon: 'i-pixelarticons-settings-cog',
		to: '/settings',
		placement: 'footer',
	},
];

/** The entry owning a path: exact match for Home, prefix match for sections. */
export function findNavigationEntry(path: string): NavigationEntry | undefined {
	return navigationEntries.find((entry) =>
		entry.to === '/' ? path === '/' : path === entry.to || path.startsWith(`${entry.to}/`),
	);
}
