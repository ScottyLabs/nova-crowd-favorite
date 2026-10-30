<script lang="ts">
	interface Props {
		href: string;
		note: string;
		teamName: string;
	}

	let { href, note, teamName }: Props = $props();
	const hasNote = $derived(note.trim().length > 0);
</script>

<a class="note-link" href="{href}#note" aria-label="{hasNote ? 'View' : 'Add'} note for {teamName}">
	{hasNote ? 'View note' : 'Add note'}
</a>

<style>
	.note-link {
		display: inline-flex;
		align-items: center;
		align-self: flex-start;
		min-height: 32px;
		padding: 4px 0;
		color: var(--ink);
		font-size: 12px;
		text-underline-offset: 3px;
	}
</style>
