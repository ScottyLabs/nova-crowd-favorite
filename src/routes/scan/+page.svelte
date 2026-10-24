<script lang="ts">
	import { onMount } from 'svelte';
	import jsQR from 'jsqr';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getVoterCode } from '#lib/voter/identity.ts';
	import { teamCodeFromQr } from '#lib/voter/qr.ts';
	import Button from '#lib/voter/ui/Button.svelte';
	import Icon from '#lib/voter/ui/Icon.svelte';
	import Screen from '#lib/voter/ui/Screen.svelte';
	import TopBar from '#lib/voter/ui/TopBar.svelte';

	// In-app QR scanner (Figma 1b) and "Camera is off" (Figma 7b).
	// /scan            "Scan a team": adds the team to your collection (/t/<code>)
	// /scan?mode=team  "Scan my team": links the sticker to your team (/link/<code>)

	// How often to look for a QR code in the camera picture.
	const SCAN_EVERY_MS = 150;
	// Shrink each frame to this width before decoding. Faster, and QR codes still read fine.
	const DECODE_WIDTH = 640;
	// How long "That's not a Nova team sticker" stays on screen.
	const HINT_MS = 2500;

	const myTeamMode = $derived(page.url.searchParams.get('mode') === 'team');

	let video = $state<HTMLVideoElement | null>(null);
	let status = $state<'starting' | 'scanning' | 'blocked'>('starting');
	let wrongCode = $state(false);

	let stream: MediaStream | null = null;
	let scanTimer: ReturnType<typeof setTimeout> | undefined;
	let hintTimer: ReturnType<typeof setTimeout> | undefined;
	const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');

	onMount(() => {
		if (getVoterCode() === null) {
			void goto('/', { replaceState: true });
		} else {
			void startCamera();
		}
		return stopCamera;
	});

	async function startCamera(): Promise<void> {
		status = 'starting';
		if (!('mediaDevices' in navigator) || video === null) {
			status = 'blocked';
			return;
		}
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } },
				audio: false
			});
			video.srcObject = stream;
			await video.play();
			status = 'scanning';
			scanTimer = setTimeout(scanFrame, SCAN_EVERY_MS);
		} catch {
			stopCamera();
			status = 'blocked';
		}
	}

	function stopCamera(): void {
		clearTimeout(scanTimer);
		clearTimeout(hintTimer);
		for (const track of stream?.getTracks() ?? []) track.stop();
		stream = null;
	}

	/** Look for a QR code in the current camera picture, then check again shortly. */
	function scanFrame(): void {
		const text = readQr();
		if (text !== null) {
			const code = teamCodeFromQr(text);
			if (code !== null) {
				stopCamera();
				const path = myTeamMode ? '/link/' : '/t/';
				void goto(path + encodeURIComponent(code), { replaceState: true });
				return;
			}
			showWrongCode();
		}
		scanTimer = setTimeout(scanFrame, SCAN_EVERY_MS);
	}

	function readQr(): string | null {
		if (video === null || canvas === null || video.videoWidth === 0) return null;
		const scale = Math.min(1, DECODE_WIDTH / video.videoWidth);
		const width = Math.round(video.videoWidth * scale);
		const height = Math.round(video.videoHeight * scale);
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (context === null) return null;
		context.drawImage(video, 0, 0, width, height);
		const image = context.getImageData(0, 0, width, height);
		const found = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' });
		return found === null ? null : found.data;
	}

	function showWrongCode(): void {
		wrongCode = true;
		clearTimeout(hintTimer);
		hintTimer = setTimeout(() => {
			wrongCode = false;
		}, HINT_MS);
	}

	function close(): void {
		stopCamera();
		void goto('/collection');
	}
</script>

<svelte:head>
	<title>{myTeamMode ? 'Scan my team' : 'Scan a team'} - Nova Crowd Favorite</title>
</svelte:head>

{#if status === 'blocked'}
	<Screen group="scan" step="Scan">
		<h1 class="title">Camera is off</h1>
		<div class="card">
			<p>To scan inside the app, allow camera access for this site in your browser settings.</p>
			{#if myTeamMode}
				<p>Or skip it: open your phone's camera app and point it at your team's sticker.</p>
			{:else}
				<p>Or skip it: open your phone's camera app and point it at the team's QR code.</p>
			{/if}
		</div>
		<div class="spacer"></div>
		<Button onclick={() => void startCamera()}>Try again</Button>
		<Button variant="secondary" href="/collection">Back to collection</Button>
	</Screen>
{/if}

<div class="scanner" class:hidden={status === 'blocked'}>
	<video class="camera" bind:this={video} playsinline muted></video>
	<div class="dim"></div>

	<div class="content">
		<TopBar step="Scan" />
		<button class="close" type="button" aria-label="Close scanner" onclick={close}>
			<Icon name="close" size={16} />
		</button>

		<h1 class="title-md heading-line">{myTeamMode ? 'Scan my team' : 'Scan a team'}</h1>

		<div class="viewfinder" aria-hidden="true">
			<span class="corner tl"></span>
			<span class="corner tr"></span>
			<span class="corner bl"></span>
			<span class="corner br"></span>
			{#if status === 'scanning'}
				<span class="scan-line"></span>
			{/if}
		</div>

		<p class="hint" role="status">
			{#if status === 'starting'}
				Starting camera...
			{:else if wrongCode}
				That's not a Nova team sticker.
			{:else if myTeamMode}
				Point at your team's QR sticker
			{:else}
				Point at the team's QR code
			{/if}
		</p>
	</div>
</div>

<style>
	.scanner {
		position: fixed;
		inset: 0;
		z-index: 2;
		background: #0d0d14;
		color: var(--white);
	}
	.scanner.hidden {
		display: none;
	}
	.camera {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.dim {
		position: absolute;
		inset: 0;
		background: rgb(0 0 0 / 0.35);
	}
	.content {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: min(100%, var(--app-width));
		height: 100%;
		margin: 0 auto;
	}
	.content :global(.top-bar) {
		align-self: stretch;
	}
	.close {
		position: absolute;
		top: 64px;
		right: 16px;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0;
		background: rgb(255 255 255 / 0.14);
		border: 1px solid var(--white);
		border-radius: 50%;
		color: var(--white);
		cursor: pointer;
	}
	.heading-line {
		align-self: stretch;
		margin-top: 52px;
		padding: 0 var(--gutter);
	}
	.viewfinder {
		position: relative;
		width: 260px;
		height: 260px;
		margin-top: clamp(32px, 14vh, 124px);
		background: rgb(255 255 255 / 0.04);
	}
	.corner {
		position: absolute;
		width: 44px;
		height: 44px;
		border: 0 solid var(--white);
		filter: drop-shadow(0 0 4px rgb(0 0 0 / 0.5));
	}
	.tl {
		top: 0;
		left: 0;
		border-top-width: 4px;
		border-left-width: 4px;
		border-top-left-radius: 12px;
	}
	.tr {
		top: 0;
		right: 0;
		border-top-width: 4px;
		border-right-width: 4px;
		border-top-right-radius: 12px;
	}
	.bl {
		bottom: 0;
		left: 0;
		border-bottom-width: 4px;
		border-left-width: 4px;
		border-bottom-left-radius: 12px;
	}
	.br {
		right: 0;
		bottom: 0;
		border-right-width: 4px;
		border-bottom-width: 4px;
		border-bottom-right-radius: 12px;
	}
	.scan-line {
		position: absolute;
		left: 20px;
		right: 20px;
		height: 2px;
		background: linear-gradient(90deg, transparent, var(--flare), transparent);
		box-shadow: 0 0 10px var(--flare);
		animation: sweep 2.2s ease-in-out infinite alternate;
	}
	@keyframes sweep {
		from {
			top: 18%;
		}
		to {
			top: 82%;
		}
	}
	.hint {
		margin-top: 26px;
		padding: 0 var(--gutter);
		font-size: 14px;
		text-align: center;
		text-shadow: 0 1px 8px rgb(0 0 0 / 0.6);
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px;
		background: rgb(255 255 255 / 0.9);
		border: 1px solid var(--ink);
		color: var(--ink);
		font-size: 13px;
		line-height: 1.45;
	}
	.spacer {
		flex: 1;
	}
	@media (prefers-reduced-motion: reduce) {
		.scan-line {
			top: 50%;
			animation: none;
		}
	}
</style>