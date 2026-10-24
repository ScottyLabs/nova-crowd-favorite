<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ApiError, getBallot, getCollection } from '#lib/voter/api.ts';
	import { clearVoterCode, getVoterCode } from '#lib/voter/identity.ts';
	import type { Ballot, Team } from '#lib/voter/types.ts';
	import Icon from '#lib/voter/ui/Icon.svelte';
	import Screen from '#lib/voter/ui/Screen.svelte';

	// Ballot submitted (Figma screen 5). Read-only: a submitted ballot can't be changed.

	let ballot = $state<Ballot | null>(null);
	let teams = $state<Map<string, Team>>(new Map());
	let error = $state<string | null>(null);

	const submittedLabel = $derived(formatSubmitted(ballot?.submittedAt ?? null));

	onMount(() => {
		if (getVoterCode() === null) {
			void goto('/', { replaceState: true });
		} else {
			void load();
		}
	});

	async function load(): Promise<void> {
		try {
			const [loadedBallot, items] = await Promise.all([getBallot(), getCollection()]);
			if (loadedBallot.votingClosed) {
				await goto('/closed', { replaceState: true });
				return;
			}
			if (loadedBallot.status !== 'submitted') {
				await goto('/collection', { replaceState: true });
				return;
			}
			teams = new Map(items.map((item) => [item.team.id, item.team]));
			ballot = loadedBallot;
		} catch (e) {
			if (e instanceof ApiError && e.code === 'unauthorized') {
				clearVoterCode();
				await goto('/?reason=invalid', { replaceState: true });
				return;
			}
			error = 'Could not load your ballot. Refresh to try again.';
		}
	}

	/** "Submitted 11.7.2026 - 7:42 PM" (with a middle dot), in the voter's own time zone. */
	function formatSubmitted(iso: string | null): string {
		if (iso === null) return '';
		const date = new Date(iso);
		if (Number.isNaN(date.getTime())) return '';
		const day = `${date.getMonth() + 1}.${date.getDate()}.${date.getFullYear()}`;
		const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		return `Submitted ${day} \u00B7 ${time}`;
	}
</script>

<svelte:head>
	<title>Ballot submitted - Nova Crowd Favorite</title>
</svelte:head>

<Screen group="submission" step="Submitted">
	<img class="vertical-logo" src="/nova-logo.png" alt="" aria-hidden="true" />

	<h1 class="title">Ballot submitted</h1>

	{#if error !== null}
		<p class="error" role="alert">{error}</p>
	{:else if ballot !== null}
		<div class="confirm" role="status">
			<Icon name="check" size={36} />
			<p class="confirm-title">Your ballot is in.</p>
			<p class="confirm-sub">Thanks for voting!</p>
		</div>

		<ol class="final glass" aria-label="Your final top 5">
			{#each ballot.ranked as teamId, i (teamId)}
				<li>
					<span class="num">{i + 1}</span>
					<span class="name">{teams.get(teamId)?.name ?? 'Team'}</span>
				</li>
			{/each}
		</ol>

		<p class="small">{submittedLabel}</p>
	{/if}

	<div class="spacer"></div>

	<p class="footnote">Crowd favorite is announced at closing ceremony.</p>
</Screen>

<style>
	.vertical-logo {
		position: absolute;
		z-index: -1;
		top: 72%;
		left: calc(100% - 42px);
		width: 380px;
		height: auto;
		transform: translate(-50%, -50%) rotate(90deg);
		filter: drop-shadow(0 0 12px rgb(255 255 255 / 0.85));
		pointer-events: none;
	}
	.confirm {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 24px 20px;
		background: var(--cobalt);
		color: var(--white);
		box-shadow: 0 10px 30px rgb(49 75 180 / 0.35);
	}
	.confirm-title {
		font-size: 24px;
		line-height: 1.2;
	}
	.confirm-sub {
		font-size: 14px;
	}
	.final {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 0;
		padding: 16px;
		list-style: none;
		background: rgb(255 255 255 / 0.35);
	}
	.final li {
		display: flex;
		gap: 16px;
		font-size: 14px;
		line-height: 1.45;
	}
	.num {
		flex: none;
		width: 10px;
	}
	.name {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.spacer {
		flex: 1;
	}
	.footnote {
		font-size: 12px;
	}
	.error {
		padding: 12px 14px;
		background: var(--ink);
		color: var(--white);
		border: 1px solid var(--flare);
		font-size: 13px;
	}
</style>