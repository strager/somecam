<script setup lang="ts">
defineProps<{
	variant: "primary" | "secondary";
	disabled?: boolean;
}>();
</script>

<template>
	<!-- eslint-disable-next-line vue/no-restricted-html-elements -->
	<button :class="'btn-' + variant" :disabled="disabled">
		<span><slot /></span>
	</button>
</template>

<style scoped>
span {
	display: block;
	padding: var(--space-2) var(--space-6);
	transition: transform 0.06s ease;
}

button:hover:active span {
	transform: translateY(1px);
}

button:disabled:active span {
	transform: none;
}
</style>
