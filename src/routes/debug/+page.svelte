<script lang="ts">
	let { data } = $props();
</script>

<h1>Nova Crowd Favorite</h1>
<p>Tables: {data.tables.join(', ')}</p>
