<script lang="ts" module>
	export type BackgroundGroup = 'intro' | 'scan' | 'rating' | 'ballot' | 'submission';
</script>

<script lang="ts">
	// Faded poster-style background, one per screen group (matches the Figma BG/* components).
	// Washes are cheap CSS radial gradients instead of blurred shapes, so it stays fast on phones.
	// Positions come from the 390x844 Figma frame and are converted to percentages.

	interface Props {
		group: BackgroundGroup;
	}

	let { group }: Props = $props();

	type Color = 'flare' | 'orchid' | 'cobalt' | 'white';
	// [color, x, y, diameter, opacity] in Figma pixels
	type Wash = [Color, number, number, number, number];
	// [x, y, size, rotation] in Figma pixels
	type Shard = [number, number, number, number];

	const RGB: Record<Color, string> = {
		flare: '253 80 10',
		orchid: '237 173 238',
		cobalt: '49 75 180',
		white: '255 255 255'
	};

	const GROUPS: Record<BackgroundGroup, { washes: Wash[]; shards: Shard[] }> = {
		intro: {
			washes: [
				['cobalt', 60, -220, 560, 0.36],
				['orchid', 230, -180, 440, 0.43],
				['flare', -300, 120, 660, 0.61],
				['cobalt', -60, 540, 680, 0.3],
				['white', 170, 600, 520, 0.65]
			],
			shards: [
				[40, 110, 540, -10],
				[130, 470, 440, 24]
			]
		},
		scan: {
			washes: [
				['flare', -230, -230, 640, 0.52],
				['orchid', -160, -260, 340, 0.4],
				['white', 240, 40, 460, 0.75],
				['cobalt', -200, 360, 740, 0.4],
				['white', -120, 700, 620, 0.55]
			],
			shards: [
				[80, -70, 520, 14],
				[150, 380, 480, -20]
			]
		},
		rating: {
			washes: [
				['orchid', -270, -170, 620, 0.43],
				['flare', 250, -250, 400, 0.32],
				['white', -90, 520, 540, 0.6],
				['cobalt', 190, 400, 600, 0.32]
			],
			shards: [[190, 500, 400, -15]]
		},
		ballot: {
			washes: [
				['flare', -210, -270, 440, 0.32],
				['orchid', 150, -230, 580, 0.4],
				['cobalt', -330, 200, 640, 0.25],
				['white', -70, 340, 640, 0.6],
				['cobalt', 120, 620, 560, 0.22]
			],
			shards: [[180, 480, 440, 10]]
		},
		submission: {
			washes: [
				['cobalt', -140, -250, 660, 0.43],
				['orchid', 200, 100, 440, 0.36],
				['white', -220, 340, 540, 0.6],
				['flare', 150, 540, 620, 0.45]
			],
			shards: [
				[50, 30, 540, 20],
				[-90, 520, 400, -10]
			]
		}
	};

	// One flat color per group, between the colors at the top and bottom edges.
	// Phone browsers paint this behind the status bar and toolbars (Safari tints its bars
	// from the page's background color, Chrome on Android uses theme-color), so the
	// bars match the screen instead of showing a gray strip.
	const EDGE: Record<BackgroundGroup, string> = {
		intro: '#c8c4d9',
		scan: '#d9c0c3',
		rating: '#e5dce6',
		ballot: '#e1d5dd',
		submission: '#cbc8d7'
	};

	const W = 390;
	const H = 844;

	function washToGradient([color, x, y, d, opacity]: Wash): string {
		const cx = ((x + d / 2) / W) * 100;
		const cy = ((y + d / 2) / H) * 100;
		// Wider than the shape itself, so the edge fades out like a heavy blur.
		const rx = ((d * 0.75) / W) * 100;
		const ry = ((d * 0.75) / H) * 100;
		const rgb = RGB[color];
		const mid = (opacity * 0.6).toFixed(3);
		return `radial-gradient(ellipse ${rx}% ${ry}% at ${cx}% ${cy}%, rgb(${rgb} / ${opacity}) 0%, rgb(${rgb} / ${mid}) 45%, rgb(${rgb} / 0) 100%)`;
	}

	const config = $derived(GROUPS[group]);
	const edge = $derived(EDGE[group]);

	$effect(() => {
		document.documentElement.style.backgroundColor = edge;
		document.body.style.backgroundColor = edge;
	});
	const washes = $derived(config.washes.map(washToGradient).join(', '));

	// 8-point star, inner radius 0.16 (same as the Figma shards)
	const STAR =
		'50,0 53.1,42.6 85.4,14.6 57.4,46.9 100,50 57.4,53.1 85.4,85.4 53.1,57.4 50,100 46.9,57.4 14.6,85.4 42.6,53.1 0,50 42.6,46.9 14.6,14.6 46.9,42.6';
</script>

<svelte:head>
	<meta name="theme-color" content={edge} />
</svelte:head>

<div class="bg" aria-hidden="true" style:background-color={edge}>
	<div class="washes" style:background-image={washes}></div>
	<div class="haze"></div>
	{#each config.shards as [x, y, size, rot], i (i)}
		<svg
			class="shard"
			viewBox="0 0 100 100"
			style:left="{(x / W) * 100}%"
			style:top="{(y / H) * 100}%"
			style:width="{(size / W) * 100}%"
			style:transform="rotate({rot}deg)"
		>
			<defs>
				<linearGradient id="shard-fill-{i}" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stop-color="#fff" stop-opacity="0.32" />
					<stop offset="1" stop-color="#fff" stop-opacity="0.06" />
				</linearGradient>
			</defs>
			<polygon
				points={STAR}
				fill="url(#shard-fill-{i})"
				stroke="#fff"
				stroke-opacity="0.55"
				stroke-width="1"
				vector-effect="non-scaling-stroke"
			/>
		</svg>
	{/each}
</div>

<style>
	.bg {
		position: fixed;
		/* Fill the whole window, edge to edge, including on wide screens. */
		inset: 0;
		/* Phones: cover the area behind the browser's toolbars too, not just the visible part. */
		min-height: 100lvh;
		z-index: 0;
		overflow: hidden;
		background-color: var(--mist);
		pointer-events: none;
	}
	.washes,
	.haze {
		position: absolute;
		inset: 0;
	}
	.haze {
		background: linear-gradient(
			to bottom,
			rgb(255 255 255 / 0.12),
			rgb(237 237 250 / 0.38)
		);
	}
	.shard {
		position: absolute;
		height: auto;
		aspect-ratio: 1;
		overflow: visible;
	}
</style>