<!-- Temporary test component for validating Vue SFC rendering via SSR.
     Will be replaced by ReportContent.vue in Phase 3. -->

<script setup lang="ts">
defineProps<{
	title: string;
}>();
</script>

<template>
	<div id="app">
		<h1>SoMeCaM Report</h1>
		<p>{{ title }}</p>
	</div>
</template>
