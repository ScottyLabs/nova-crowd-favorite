<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { addByQr, ApiError, getMyTeam } from '#lib/voter/api.ts';
	import { goToClosedIf } from '#lib/voter/closed.ts';
	import { clearVoterCode, getVoterCode } from '#lib/voter/identity.ts';
	import type { ScanResult } from '#lib/voter/types.ts';
	import Button from '#lib/voter/ui/Button.svelte';
	import Icon from '#lib/voter/ui/Icon.svelte';
	import Screen from '#lib/voter/ui/Screen.svelte';

	// Result of scanning a team's QR code with "Scan a team" or the phone camera
	// (Figma screens 2a, 2b, 2e, 2f). The QR code links here: /t/<code>.
	// This page only adds teams to the collection. It never links a sticker to a
	// team. If the sticker isn't linked yet and the voter's team has no sticker,
	// it might be theirs, so we send them to the "Link this code?" screen instead.

	const DOT = '\u00B7';

	const code = $derived(page.params.code ?? '');

	let result = $state<ScanResult | null>(null);
	let failed = $state(false);

	onMount(() => {
		if (getVoterCode() === null) {
			void goto('/', { replaceState: true });
		} else {
			void scan();
		}
	});

	async function scan(): Promise<void> {
		failed = false;
		result = null;
		try {
			const scanned = await addByQr(code);
			if (scanned.kind === 'unlinked' && (await teamCanLink())) {
				await goto(`/link/${encodeURIComponent(code)}`, { replaceState: true });
				return;
			}
			result = scanned;
		} catch (e) {
			if (await goToClosedIf(e)) return;
			if (e instanceof ApiError && e.code === 'unauthorized') {
				clearVoterCode();
				await goto('/?reason=invalid', { replaceState: true });
				return;
			}
			failed = true;
		}
	}

	/** True when the voter's team has no sticker yet. If the check fails, assume not. */
	async function teamCanLink(): Promise<boolean> {
		try {
			const mine = await getMyTeam();
			return mine.team !== null && !mine.linked;
		} catch {
			return false;
		}
	}

	function teamsLabel(count: number): string {
		return count === 1 ? '1 team' : `${count} teams`;
	}
</script>

<svelte:head>
	<title>Scanned - Nova Crowd Favorite</title>
</svelte:head>

<Screen group="scan" step="Scanned">
	{#if failed}
		<p class="kicker">Scanned</p>
		<h1 class="title-md">Couldn't add this team</h1>
		<p class="callout dark" role="alert">Check your connection and try again.</p>
		<div class="spacer"></div>
		<Button onclick={() => void scan()}>Try again</Button>
		<Button variant="secondary" href="/collection">View collection</Button>
	{:else if result === null}
		<p class="kicker">Scanning...</p>
	{:else if result.kind === 'added' || result.kind === 'already'}
		<p class="kicker">Scanned</p>
		<h1 class="title-md">{result.team.name}</h1>
		<p class="desc">{result.team.members}</p>
		<p class="callout added" role="status">
			<Icon name="check" size={16} />
			{result.kind === 'added' ? 'Added to your collection' : 'Already in your collection'}
			{DOT}
			{teamsLabel(result.count)}
		</p>
		<div class="spacer"></div>
		<Button href="/team/{result.team.id}">Add a note</Button>
		<Button variant="secondary" href="/collection">View collection</Button>
		<p class="tiny">Keep scanning with your phone camera.</p>
	{:else if result.kind === 'own-team'}
		<p class="kicker">Scanned</p>
		<h1 class="title-md">{result.team.name}</h1>
		<p class="desc">{result.team.members}</p>
		<p class="callout dark">This is your team. You can't vote for your own project.</p>
		<div class="spacer"></div>
		<Button variant="secondary" href="/collection">View collection</Button>
	{:else if result.kind === 'unlinked'}
		<p class="kicker">Scanned</p>
		<h1 class="title-md">Code not linked</h1>
		<p class="desc">This QR code isn't linked to a team yet.</p>
		<p class="callout dark">Ask that team to link it first, then scan it again.</p>
		<div class="spacer"></div>
		<Button variant="secondary" href="/collection">View collection</Button>
	{:else}
		<p class="kicker">Scanned</p>
		<h1 class="title-md">Code not recognized</h1>
		<p class="desc">This QR code isn't from Nova Crowd Favorite.</p>
		<p class="callout dark">Scan the QR code at a team's table, or ask an organizer for help.</p>
		<div class="spacer"></div>
		<Button variant="secondary" href="/collection">View collection</Button>
	{/if}
</Screen>

<style>
	.kicker,
	.desc {
		font-size: 13px;
		line-height: 1.45;
		color: var(--white);
		text-shadow: 0 1px 10px rgb(26 26 51 / 0.25);
	}
	.callout {
		padding: 14px 16px;
		font-size: 13px;
		line-height: 1.45;
		color: var(--white);
	}
	.added {
		display: flex;
		align-items: center;
		gap: 10px;
		align-self: flex-start;
		background: var(--cobalt);
	}
	.dark {
		background: var(--ink);
		border: 1.5px solid var(--flare);
		box-shadow: 0 0 12px rgb(253 80 10 / 0.6);
	}
	.spacer {
		flex: 1;
	}
</style>