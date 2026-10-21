<script lang="ts" module>
	export type IconName =
		| 'check'
		| 'chevron-left'
		| 'pencil'
		| 'plus'
		| 'scan'
		| 'alert'
		| 'lock'
		| 'close'
		| 'grip';
</script>

<script lang="ts">
	// Small line icons from the Figma "Icon/*" components. They use currentColor,
	// so they take the text color of whatever they sit in.

	interface Props {
		name: IconName;
		size?: number;
		label?: string;
	}

	let { name, size = 16, label }: Props = $props();
</script>

<svg
	class="icon"
	width={size}
	height={size}
	viewBox="0 0 16 16"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label === undefined ? undefined : 'img'}
	aria-label={label}
	aria-hidden={label === undefined ? 'true' : undefined}
>
	{#if name === 'check'}
		<path d="M3 8.5l3.2 3.2L13 4.8" />
	{:else if name === 'chevron-left'}
		<path d="M10 3L5 8l5 5" />
	{:else if name === 'pencil'}
		<path d="M10.5 2.5l3 3L6 13H3v-3z" />
	{:else if name === 'plus'}
		<path d="M8 3v10M3 8h10" />
	{:else if name === 'scan'}
		<path
			d="M2 6V3a1 1 0 0 1 1-1h3M10 2h3a1 1 0 0 1 1 1v3M14 10v3a1 1 0 0 1-1 1h-3M6 14H3a1 1 0 0 1-1-1v-3M5 8h6"
		/>
	{:else if name === 'alert'}
		<circle cx="8" cy="8" r="6" />
		<path d="M8 5v3.5M8 11h.01" />
	{:else if name === 'lock'}
		<rect x="3" y="7" width="10" height="7" rx="1" />
		<path d="M5 7V5a3 3 0 0 1 6 0v2" />
	{:else if name === 'close'}
		<path d="M4 4l8 8M12 4l-8 8" />
	{:else if name === 'grip'}
		<g fill="currentColor" stroke="none">
			<circle cx="5.5" cy="3.5" r="1.3" />
			<circle cx="10.5" cy="3.5" r="1.3" />
			<circle cx="5.5" cy="8" r="1.3" />
			<circle cx="10.5" cy="8" r="1.3" />
			<circle cx="5.5" cy="12.5" r="1.3" />
			<circle cx="10.5" cy="12.5" r="1.3" />
		</g>
	{/if}
</svg>

<style>
	.icon {
		flex: none;
		display: block;
	}
</style>