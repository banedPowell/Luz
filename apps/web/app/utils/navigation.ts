export interface NavigationEntry {
	label: string;
	icon: string;
	to: string;
}

export const navigationEntries: readonly NavigationEntry[] = [
	{ label: 'Home', icon: 'i-pixelarticons-home', to: '/' },
	{ label: 'Library', icon: 'i-pixelarticons-library', to: '/library' },
	{ label: 'Downloads', icon: 'i-pixelarticons-download', to: '/downloads' },
	{ label: 'Settings', icon: 'i-pixelarticons-settings-cog', to: '/settings' },
];

/** The entry owning a path: exact match for Home, prefix match for sections. */
export function findNavigationEntry(path: string): NavigationEntry | undefined {
	return navigationEntries.find((entry) =>
		entry.to === '/' ? path === '/' : path === entry.to || path.startsWith(`${entry.to}/`),
	);
}
