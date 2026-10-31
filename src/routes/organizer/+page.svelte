<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '$app/forms';
	import Background from '../../lib/voter/ui/Background.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const tabs = ['Voters', 'Teams', 'QR codes', 'Results', 'Settings'];
	let tab = $state('Voters');
	let search = $state('');
	let status = $state('all');
	let busy = $state(false);
	let dialog = $state<HTMLDialogElement>();
	let editor = $state('');
	let selected = $state('');
	let deadline = $state('');
	let copied = $state(false);
	let feedbackTab = $state('');
	const ballotStatus = (value: unknown) => value === 'submitted' ? 'Submitted' : value === 'draft' ? 'Draft' : 'Not started';
	const matches = (...values: unknown[]) => values.join(' ').toLowerCase().includes(search.trim().toLowerCase());
	const ballots = $derived(new Map((data.ballots ?? []).map(ballot => [ballot.email, ballot])));
	const voter = $derived(data.voters?.find(row => row.email === selected));
	const team = $derived(data.teams?.find(row => row.id === selected));
	const sticker = $derived(data.stickers?.find(row => row.code === selected));
	const ballot = $derived(ballots.get(selected));
	const voters = $derived((data.voters ?? []).filter(row =>
		matches(row.email, row.team, ...Object.values(ballots.get(row.email) ?? {})) && (status === 'all' || (row.status ?? 'none') === status)));
	const teams = $derived((data.teams ?? []).filter(row => matches(row.name, row.members, row.emails)));
	const stickers = $derived((data.stickers ?? []).map((row, index) => ({ number: index + 1, code: row.code, team: row.team, email: row.email }))
		.filter(row => matches(row.number, row.team, row.email, row.code)));
	const ranking = $derived(form?.result?.ranking ?? []);
	const ranks = $derived([...new Set(ranking.map(entry => entry.rank))]);
	const closed = $derived(Boolean(data.deadline && Date.parse(data.deadline) <= Date.now()));
	const links = $derived(form?.result?.url ? `${form.result.email}: ${form.result.url}`
		: form?.result?.voters?.map((link: { email: string; url: string }) => `${link.email}: ${link.url}`).join('\n') ?? '');
	const titles: Record<string, string> = {
		voters: 'Add voters', voter: 'Voter details', reissue: 'Replace voter link?', reset: 'Reset ballot?',
		team: 'Edit team', disqualify: 'Disqualify team?', reinstate: 'Reinstate team?',
		stickers: 'Create QR codes', register: 'Register printed codes', unlink: 'Release QR code?',
		deadline: 'Set closing time', 'clear-deadline': 'Clear closing time?', close: 'Close voting?', open: 'Reopen voting?', restore: 'Restore database?'
	};

	function open(kind: string, id = '') {
		editor = kind; selected = id; copied = false; form = null;
		if (kind === 'deadline') {
			const date = new Date(data.deadline ?? Date.now() + 60 * 60 * 1000);
			deadline = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
		}
		if (dialog && !dialog.open) dialog.showModal();
	}
	async function copyLinks() {
		try { await navigator.clipboard.writeText(links); copied = true; }
		catch { document.querySelector<HTMLTextAreaElement>('#voter-links')?.select(); }
	}
	const submit: SubmitFunction = ({ cancel, formData }) => {
		if (busy) { cancel(); return; }
		busy = true; feedbackTab = tab;
		return async ({ result, update }) => {
			try {
				await update({ reset: false });
				if (result.type === 'success' && formData.get('operation') !== 'voters' && formData.get('operation') !== 'reissue') dialog?.close();
			} finally { busy = false; }
		};
	};
</script>

<svelte:head><title>Organizer | Crowd Favorite</title><meta name="robots" content="noindex, nofollow" /></svelte:head>
<Background group="ballot" />
<main>
	<header>
		<div><span class="eyebrow">Crowd Favorite</span><h1>Organizer</h1></div>
		{#if data.authenticated}<div class="actions">
			<button class="quiet" disabled={busy} onclick={() => invalidateAll()}>Refresh</button>
			<form method="POST" action="?/logout"><button class="quiet">Sign out</button></form>
		</div>{/if}
	</header>
	{#if !data.authenticated}
		<section class="panel login">
			<h2>Sign in</h2>
			{#if data.configured}<form method="POST" action="?/login" use:enhance={submit}>
				<label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
				{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
				<button class="primary" disabled={busy}>Sign in</button>
			</form>{:else}<p>The organizer password has not been set up.</p>{/if}
		</section>
	{:else}
		<div class="event-bar">
			<div><span class="dot" class:closed></span><strong>Voting {closed ? 'closed' : 'open'}</strong>
				<span class="muted">{data.deadline ? ` / ${closed ? 'Closed' : 'Closes'} ${new Date(data.deadline).toLocaleString()}` : ' / No closing time set'}</span>
			</div>
			<button class="text-button" onclick={() => { tab = 'Settings'; search = ''; }}>Manage voting</button>
		</div>
		<nav aria-label="Organizer sections">{#each tabs as item}
			<button class:current={tab === item} aria-current={tab === item ? 'page' : undefined}
				onclick={() => { tab = item; search = ''; status = 'all'; }}>{item}</button>
		{/each}</nav>
		{#if !editor && feedbackTab === tab && (form?.error || (form?.message && !form?.result?.ranking))}
			<div class="notice" class:error={Boolean(form?.error)} role="status">
				<span>{form?.error ?? form?.message}</span><button class="text-button" onclick={() => form = null}>Dismiss</button>
			</div>
		{/if}
		<section class="panel" aria-busy={busy}>
			<div class="section-heading">
				<div><h2>{tab}</h2><p class="muted">
					{#if tab === 'Voters'}{data.voters?.length} voters / {data.ballots?.filter(row => row.status === 'submitted').length} ballots submitted
					{:else if tab === 'Teams'}{data.teams?.length} registered teams
					{:else if tab === 'QR codes'}{data.stickers?.filter(row => row.team === null).length} unclaimed / {data.stickers?.length} total
					{:else if tab === 'Results'}{form?.result?.ranking ? `${form.result.submittedBallots} submitted ballots` : 'Count submitted ballots'}
					{:else}Voting and database controls{/if}
				</p></div>
				<div class="actions">
					{#if tab === 'Voters'}<a class="button quiet" href="/organizer/download/ballots">Export ballots</a><button class="primary" onclick={() => open('voters')}>Add voters</button>
					{:else if tab === 'QR codes'}<a class="button quiet" href="/organizer/stickers" target="_blank" rel="noreferrer">Print all</a><button class="primary" onclick={() => open('stickers')}>Create QR codes</button>
					{:else if tab === 'Results'}{@render action('tally', {}, form?.result?.ranking ? 'Recalculate' : 'Calculate results', 'primary')}{/if}
				</div>
			</div>
			{#if ['Voters', 'Teams', 'QR codes'].includes(tab)}
				<div class="toolbar">
					<input type="search" aria-label={`Search ${tab.toLowerCase()}`} bind:value={search}
						placeholder={tab === 'Voters' ? 'Search email, team, or ballot' : tab === 'Teams' ? 'Search team or member' : 'Search number or team'} />
					{#if tab === 'Voters'}<select aria-label="Ballot status" bind:value={status}>
						<option value="all">All ballots</option><option value="submitted">Submitted</option><option value="draft">Draft</option><option value="none">Not started</option>
					</select>{/if}
				</div>
			{/if}
			{#if tab === 'Voters'}
				<table aria-label="Voters"><thead><tr><th>Voter</th><th class="desktop">Team</th><th class="desktop">Ballot</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
					{#each voters as row}<tr><td><strong>{row.email}</strong><span class="mobile muted">{row.team || 'No team'} / {ballotStatus(row.status)}</span></td><td class="desktop">{row.team || 'No team'}</td>
						<td class="desktop"><span class="badge" class:submitted={row.status === 'submitted'}>{ballotStatus(row.status)}</span></td>
						<td><button class="quiet" onclick={() => open('voter', String(row.email))}>Manage<span class="sr-only"> {row.email}</span></button></td></tr>
					{:else}<tr><td colspan="4" class="empty">{search || status !== 'all' ? 'No matching voters.' : 'Add voters to create their personal links.'}</td></tr>{/each}
				</tbody></table>
			{:else if tab === 'Teams'}
				<table aria-label="Teams"><thead><tr><th>Team</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
					{#each teams as row}<tr><td><strong>{row.name}</strong><span class="muted">{row.members}</span></td>
						<td><span class="badge" class:excluded={row.reason !== null}>{row.reason !== null ? 'Disqualified' : row.active ? 'Eligible' : 'Inactive'}</span></td>
						<td><button class="quiet" onclick={() => open('team', String(row.id))}>Edit<span class="sr-only"> {row.name}</span></button></td></tr>
					{:else}<tr><td colspan="3" class="empty">{search ? 'No matching teams.' : 'Teams appear here after the submission Sheet syncs.'}</td></tr>{/each}
				</tbody></table>
			{:else if tab === 'QR codes'}
				<table aria-label="QR codes"><thead><tr><th>Number</th><th>Team</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
					{#each stickers as row}<tr><td>#{row.number}</td><td><strong>{row.team || 'Unclaimed'}</strong><span class="muted">{row.email || ''}</span></td><td><div class="actions">
						<a class="button quiet" href={`/organizer/stickers?code=${row.code}`} target="_blank" rel="noreferrer">Print<span class="sr-only"> QR {row.number}</span></a>
						{#if row.team}<button class="text-button" onclick={() => open('unlink', String(row.code))}>Release<span class="sr-only"> QR {row.number}</span></button>{/if}
					</div></td></tr>{:else}<tr><td colspan="3" class="empty">{search ? 'No matching QR codes.' : 'Create QR codes to print and hand out to teams.'}</td></tr>{/each}
				</tbody></table>
			{:else if tab === 'Results'}
				{#if form?.result?.ranking}
					<p class="result-note"><span class="result-status">{form.result.provisional ? 'Provisional' : 'Final'}</span><span class="muted">Voting is {form.result.provisional ? 'still open' : 'closed'}.</span></p>
					<ol class="rankings" aria-label="Results by rank">
						{#each ranks as rank}
							{@const names = ranking.filter(entry => entry.rank === rank)}
							<li class="result-group"><div class="place"><span class="sr-only">Rank </span>{rank}{#if names.length > 1}<small>Tied</small>{/if}</div>
								<ul class="team-names">{#each names as entry}<li>{entry.name}</li>{/each}</ul>
							</li>
						{:else}<li class="empty">No ranked teams.</li>{/each}
					</ol>
				{:else}<p class="empty">Calculate results when you are ready to review the ranking.</p>{/if}
			{:else if tab === 'Settings'}
				<div class="setting"><div><h3>Voting closes</h3><p>{data.deadline ? new Date(data.deadline).toLocaleString() : 'No closing time set'}</p></div><div class="actions"><button class="quiet" onclick={() => open('deadline')}>Change time</button>{#if data.deadline}<button class="text-button" onclick={() => open('clear-deadline')}>Clear closing time</button>{/if}</div></div>
				<div class="setting"><div><h3>Voting is {closed ? 'closed' : 'open'}</h3><p>{closed ? 'Voters cannot submit ballots.' : 'Voters can collect, rank, and submit.'}</p></div><button class="quiet" onclick={() => open(closed ? 'open' : 'close')}>{closed ? 'Reopen voting' : 'Close voting now'}</button></div>
				<div class="setting"><div><h3>Database backup</h3><p>Save a private copy of all event data.</p></div><a class="button quiet" href="/organizer/download/database">Download backup</a></div>
				<div class="setting"><div><h3>Restore database</h3><p>Replace event data with a saved backup.</p></div><button class="text-button danger" onclick={() => open('restore')}>Restore from backup</button></div>
			{/if}
		</section>
		<dialog bind:this={dialog} aria-labelledby="dialog-title" onclose={() => editor = ''} oncancel={(event) => { if (busy) event.preventDefault(); }}>
			<div class="dialog-heading"><h2 id="dialog-title">{links ? 'Voter links ready' : titles[editor]}</h2><button class="quiet" aria-label="Close dialog" disabled={busy} onclick={() => dialog?.close()}>Close</button></div>
			{#if form?.error}<p class="error notice" role="alert">{form.error}</p>{/if}
			{#if links}<p>Copy these links before closing. Send each voter their own link.</p>
				<textarea id="voter-links" aria-label="Voter links" rows="6" readonly value={links} onfocus={(event) => event.currentTarget.select()}></textarea>
				<div class="actions"><button class="primary" onclick={copyLinks}>{copied ? 'Copied' : 'Copy links'}</button><button class="quiet" onclick={() => dialog?.close()}>Done</button></div>
			{:else if editor === 'voters'}
				<form method="POST" action="?/run" use:enhance={submit}><input type="hidden" name="operation" value="voters" />
					<label>Email addresses<textarea name="emails" rows="5" required placeholder="One per line, or separated by commas"></textarea></label><button class="primary" disabled={busy}>Create voter links</button>
				</form>
			{:else if editor === 'voter'}
				<p><strong>{voter?.email}</strong></p><p class="muted">{voter?.team || 'No team'}</p>
				<h3>Ballot</h3>{#if ballot}<p>{ballot.status === 'submitted' ? 'Submitted' : 'Draft'} / {new Date(String(ballot.updated)).toLocaleString()}</p><ol>{#each [ballot.rank1, ballot.rank2, ballot.rank3, ballot.rank4, ballot.rank5].filter(Boolean) as name}<li>{name}</li>{/each}</ol>
					<button class="quiet danger" onclick={() => open('reset', selected)}>Reset ballot</button>{:else}<p>No ballot started.</p>{/if}
				<div class="dialog-section"><h3>Voter link</h3><p>Existing links cannot be retrieved. Replacing a link disables the old one.</p><button class="quiet" onclick={() => open('reissue', selected)}>Replace voter link</button></div>
			{:else if editor === 'team'}
				<form method="POST" action="?/run" use:enhance={submit}><input type="hidden" name="operation" value="team-name" /><input type="hidden" name="teamId" value={selected} />
					<label>Team name<input name="name" value={String(team?.name ?? '')} maxlength="200" required /></label><p class="muted">{team?.members}</p><p class="muted">{team?.emails || 'No member emails in the Sheet.'}</p><button class="primary" disabled={busy}>Save name</button>
				</form>
				<div class="dialog-section"><h3>Eligibility</h3><p>{team?.reason !== null ? `Disqualified: ${team?.reason || 'No reason given'}` : 'This team is included in the results.'}</p>
					<button class="quiet" onclick={() => open(team?.reason !== null ? 'reinstate' : 'disqualify', selected)}>{team?.reason !== null ? 'Reinstate team' : 'Disqualify team'}</button>
				</div>
			{:else if editor === 'reissue'}<p>Replace the link for <strong>{selected}</strong>? Their old link will stop working.</p>{@render action('reissue', { email: selected }, 'Replace link', 'primary')}
			{:else if editor === 'reset'}<p>Clear the ballot for <strong>{selected}</strong>? Their collection and voter link stay intact. The previous ballot is archived.</p>{#if closed}<p class="error">Voting is closed. Reopen it before asking this voter to submit again.</p>{/if}{@render action('reset', { email: selected }, 'Reset ballot', 'danger')}
			{:else if editor === 'disqualify' || editor === 'reinstate'}<p><strong>{team?.name}</strong></p><p>{editor === 'disqualify' ? 'Exclude this team from results. Existing ballots are preserved.' : 'Include this team in results again.'}</p>
				<form method="POST" action="?/run" use:enhance={submit}><input type="hidden" name="operation" value="disqualify" /><input type="hidden" name="teamId" value={selected} /><input type="hidden" name="disqualified" value={String(editor === 'disqualify')} />
					{#if editor === 'disqualify'}<label>Reason (optional)<input name="reason" maxlength="1000" /></label>{/if}<button class:danger={editor === 'disqualify'} disabled={busy}>{editor === 'disqualify' ? 'Disqualify team' : 'Reinstate team'}</button>
				</form>
			{:else if editor === 'stickers'}<p>Each code starts unclaimed. A team member scans one to link it to their team.</p>
				<form method="POST" action="?/run" use:enhance={submit}><input type="hidden" name="operation" value="stickers" /><label>Number of QR codes<input type="number" name="count" min="1" max="1000" value="30" required /></label><button class="primary" disabled={busy}>Create codes</button></form>
				<button class="text-button" onclick={() => open('register')}>Already have printed codes?</button>
			{:else if editor === 'register'}<form method="POST" action="?/run" use:enhance={submit}><input type="hidden" name="operation" value="register" /><label>Codes<textarea name="codes" rows="5" required placeholder="One code per line"></textarea></label><button class="primary" disabled={busy}>Register codes</button></form>
			{:else if editor === 'unlink'}<p>Release the QR code claimed by <strong>{sticker?.team}</strong>? Another team will be able to claim it.</p>{@render action('unlink', { code: selected }, 'Release QR code', 'danger')}
			{:else if editor === 'deadline'}<form method="POST" action="?/run" use:enhance={submit}><input type="hidden" name="operation" value="voting" /><label>Closing time (your local time)<input type="datetime-local" bind:value={deadline} required /></label><input type="hidden" name="closesAt" value={deadline ? new Date(deadline).toISOString() : ''} /><button class="primary" disabled={busy}>Save closing time</button></form>
			{:else if editor === 'clear-deadline'}<p>{closed ? 'This will reopen voting with no closing time.' : 'Voting will stay open until you close it manually.'}</p>{@render action('voting', { closesAt: '' }, 'Clear closing time', 'primary')}
			{:else if editor === 'close'}<p>Voters will no longer be able to submit ballots.</p>{@render action('voting', { closesAt: new Date().toISOString() }, 'Close voting', 'danger')}
			{:else if editor === 'open'}<p>Allow voters to submit again, with no closing time set. Submitted ballots stay locked.</p>{@render action('voting', { closesAt: '' }, 'Reopen voting', 'primary')}
			{:else if editor === 'restore'}<p>This replaces all event data. The current database is saved on the server first.</p>
				<form method="POST" action="?/run" enctype="multipart/form-data" use:enhance={submit}><input type="hidden" name="operation" value="restore" /><label>Database backup<input type="file" name="backup" accept=".db,.sqlite,.sqlite3" required /></label><label>Type RESTORE to confirm<input name="confirmation" pattern="RESTORE" autocomplete="off" required /></label><button class="danger" disabled={busy}>Restore database</button></form>
			{/if}
		</dialog>
	{/if}
</main>

{#snippet action(operation: string, fields: Record<string, string>, label: string, style = 'quiet')}
	<form method="POST" action="?/run" use:enhance={submit}>
		<input type="hidden" name="operation" value={operation} />
		{#each Object.entries(fields) as [name, value]}<input type="hidden" {name} {value} />{/each}
		<button class={style} disabled={busy}>{busy ? 'Working...' : label}</button>
	</form>
{/snippet}

<style>
	main { position: relative; max-width: 1120px; margin: auto; padding: 32px 24px; }
	header, .actions, .event-bar, .section-heading, .toolbar, .setting, .dialog-heading, .notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	header { margin-bottom: 24px; } h1, h2 { font-family: var(--font-display); } h1 { font-size: 22px; margin-top: 4px; } h2 { font-size: 18px; } h3, strong { font-weight: 600; } h3 { font-size: 14px; }
	.eyebrow, .muted, th { color: var(--muted); } .eyebrow { font-size: 12px; } .actions { justify-content: flex-start; flex-wrap: wrap; }
	button, .button { display: inline-flex; justify-content: center; align-items: center; min-height: 40px; padding: 9px 14px; border: 1px solid var(--ink); background: var(--mist); color: var(--ink); font: inherit; text-decoration: none; cursor: pointer; white-space: nowrap; }
	button:disabled { opacity: .5; cursor: wait; } button:hover, .button:hover { background: var(--mist); } .primary, .primary:hover { background: var(--ink); color: white; } .quiet { background: transparent; border-color: #b3b5bd; } .text-button, .text-button:hover { border: 0; padding: 4px 0; background: transparent; text-decoration: underline; } .danger { color: #a92018; border-color: #a92018; }
	.event-bar { flex-wrap: wrap; padding: 12px 0; border-top: 1px solid #b3b5bd; border-bottom: 1px solid #b3b5bd; } .dot { display: inline-block; width: 8px; height: 8px; margin-right: 8px; background: var(--cobalt); } .dot.closed { background: var(--muted); }
	nav { display: flex; gap: 24px; margin-top: 12px; overflow-x: auto; } nav button { border: 0; border-bottom: 3px solid transparent; background: transparent; padding: 14px 0; } nav button:hover { background: transparent; } nav .current { border-color: var(--ink); font-weight: 600; }
	.panel { margin-top: 20px; padding: 24px; background: var(--glass-strong); border: 1px solid #b3b5bd; } .login { max-width: 420px; margin: 64px auto; } .section-heading { margin-bottom: 20px; flex-wrap: wrap; } .section-heading p { margin-top: 6px; } .toolbar { margin-bottom: 16px; }
	input, textarea, select { width: 100%; border: 1px solid #9698a1; border-radius: 0; padding: 11px 12px; color: var(--ink); background: white; font: inherit; } .toolbar select { width: auto; } label { display: grid; gap: 8px; margin: 16px 0; } textarea { resize: vertical; } form { margin: 0; }
	table { width: 100%; border-collapse: collapse; table-layout: auto; } th { font-size: 12px; font-weight: 400; text-align: left; } th, td { padding: 12px 10px; border-bottom: 1px solid #d2d2d9; } td { overflow-wrap: anywhere; } th:first-child, td:first-child { padding-left: 0; } th:last-child, td:last-child { padding-right: 0; } td:last-child { text-align: right; width: 1%; } td .actions { flex-wrap: nowrap; justify-content: flex-end; } td strong, td .muted { display: block; } td .muted { font-size: 12px; margin-top: 3px; } .badge { font-size: 12px; white-space: nowrap; } .badge.submitted { color: var(--cobalt); } .badge.excluded, .error { color: #a92018; }
	.result-note { display: flex; align-items: center; gap: 12px; font-size: 12px; }
	.result-status { padding: 4px 8px; background: var(--mist); }
	.rankings, .team-names { list-style: none; padding: 0; margin: 0; }
	.result-group { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 20px; padding: 24px 0; border-top: 1px solid #d2d2d9; }
	.place { font: 24px var(--font-display); color: var(--cobalt); }
	.place small { display: block; margin-top: 6px; font: 11px var(--font-mono); color: var(--muted); }
	.team-names { display: grid; gap: 12px; align-content: start; }
	.team-names li { font-size: 16px; line-height: 1.5; overflow-wrap: anywhere; }
	.empty { padding: 32px 0; color: var(--muted); text-align: center !important; } .result-note { margin-bottom: 16px; } .setting { padding: 20px 0; border-bottom: 1px solid #d2d2d9; } .setting:last-child { border: 0; } .setting p { color: var(--muted); margin-top: 4px; }
	.notice { padding: 12px 16px; margin-top: 16px; background: var(--white); border-left: 3px solid var(--cobalt); } .notice.error { border-color: #a92018; }
	dialog { width: min(520px, calc(100% - 32px)); max-height: calc(100dvh - 48px); padding: 24px; border: 1px solid var(--ink); background: var(--paper); color: var(--ink); } dialog::backdrop { background: rgb(43 43 43 / 45%); } .dialog-heading { margin-bottom: 20px; } dialog p { margin: 12px 0; overflow-wrap: anywhere; } dialog h3 { margin-top: 20px; } dialog ol { padding-left: 24px; } dialog .actions { margin-top: 16px; } .dialog-section { border-top: 1px solid #d2d2d9; margin-top: 24px; padding-top: 4px; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; } .mobile { display: none !important; }
	@media (max-width: 600px) { main { padding: 20px 16px; } h1 { font-size: 18px; } nav { gap: 20px; } .panel { padding: 16px; } .toolbar { flex-wrap: wrap; } .toolbar select { width: 100%; } .desktop { display: none; } .mobile { display: block !important; } th, td { padding: 12px 6px; } td button, td .button { padding: 8px; } .badge { white-space: normal; } .setting { align-items: start; flex-direction: column; } .event-bar { font-size: 12px; } .event-bar .muted { display: block; margin-top: 4px; } }
</style>
