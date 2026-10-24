<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ApiError, checkClaim, claimQr } from '#lib/voter/api.ts';
	import { clearVoterCode, getVoterCode } from '#lib/voter/identity.ts';
	import type { ClaimResult } from '#lib/voter/types.ts';
	import Button from '#lib/voter/ui/Button.svelte';
	import Icon from '#lib/voter/ui/Icon.svelte';
	import Screen from '#lib/voter/ui/Screen.svelte';

	// "Scan my team": link a printed QR sticker to the voter's own team
	// (Figma screens 2c and 2d). The scanner sends people here as /link/<code>.
	// Nothing is linked until they tap "Link to my team".

	const code = $derived(page.params.code ?? '');

	let result = $state<ClaimResult | null>(null);
	let working = $state(true);
	let failed = $state(false);

	/** The voter's team while we're asking "Link this code?", otherwise null. */
	const askTeam = $derived(result?.kind === 'can-link' ? result.team : null);

	onMount(() => {
		if (getVoterCode() === null) {
			void goto('/', { replaceState: true });
		} else {
			void start();
		}
	});

	async function run(task: () => Promise<void>): Promise<void> {
		working = true;
		failed = false;
		try {
			await task();
		} catch (e) {
			if (e instanceof ApiError && e.code === 'unauthorized') {
				clearVoterCode();
				await goto('/?reason=invalid', { replaceState: true });
				return;
			}
			failed = true;
		} finally {
			working = false;
		}
	}

	/** Ask "Link this code?" only if linking will work. Otherwise show why right away. */
	async function start(): Promise<void> {
		await run(async () => {
			result = await checkClaim(code);
		});
	}

	async function link(): Promise<void> {
		await run(async () => {
			result = await claimQr(code);
		});
	}
</script>

<svelte:head>
	<title>Scan my team - Nova Crowd Favorite</title>
</svelte:head>

<Screen group="scan" step="Scanned">
	<p class="kicker">Scan my team</p>

	{#if failed}
		<h1 class="title-md">Couldn't link this code</h1>
		<p class="callout dark" role="alert">Check your connection and try again.</p>
		<div class="spacer"></div>
		<Button onclick={() => void (askTeam === null ? start() : link())}>Try again</Button>
		<Button variant="secondary" href="/collection">View collection</Button>
	{:else if askTeam !== null}
		<h1 class="title-md">Link this code?</h1>
		<p class="desc">This QR code isn't linked to a team yet.</p>
		<p class="callout dark">
			Link it to your team, {askTeam.name}? Only do this for your own sticker.
		</p>
		<div class="spacer"></div>
		<Button disabled={working} onclick={() => void link()}>
			{working ? 'Linking...' : 'Link to my team'}
		</Button>
		<Button variant="secondary" href="/collection">Cancel</Button>
		<p class="tiny">Not your sticker? Tap Cancel and give it to an organizer.</p>
	{:else if result === null}
		<p class="desc">Checking...</p>
	{:else if result.kind === 'claimed' || result.kind === 'already-yours'}
		<h1 class="title-md">{result.team.name}</h1>
		<p class="desc">{result.team.members}</p>
		<p class="callout linked" role="status">
			<Icon name="check" size={16} />
			{result.kind === 'claimed'
				? 'Linked to your team. Voters who scan it will add your project.'
				: 'This sticker is already linked to your team.'}
		</p>
		<div class="spacer"></div>
		<Button variant="secondary" href="/collection">View collection</Button>
	{:else if result.kind === 'team-has-code'}
		<h1 class="title-md">Code not linked</h1>
		<p class="desc">Your team, {result.team.name}, is already linked to another sticker.</p>
		<p class="callout dark">Each team gets one code. Give this sticker back to an organizer.</p>
		<div class="spacer"></div>
		<Button variant="secondary" href="/collection">View collection</Button>
	{:else if result.kind === 'taken'}
		<h1 class="title-md">Code already linked</h1>
		<p class="desc">This sticker is linked to {result.team.name}.</p>
		<p class="callout dark">Scan your own team's sticker instead.</p>
		<div class="spacer"></div>
		<Button variant="secondary" href="/collection">View collection</Button>
	{:else if result.kind === 'no-team'}
		<h1 class="title-md">Code not linked</h1>
		<p class="desc">You're not on a team, so you can't link a sticker.</p>
		<p class="callout dark">To add a team to your collection, use Scan a team instead.</p>
		<div class="spacer"></div>
		<Button variant="secondary" href="/collection">View collection</Button>
	{:else}
		<h1 class="title-md">Code not recognized</h1>
		<p class="desc">This QR code isn't from Nova Crowd Favorite.</p>
		<p class="callout dark">Scan the sticker you got for your team, or ask an organizer for help.</p>
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
	.linked {
		display: flex;
		align-items: center;
		gap: 10px;
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