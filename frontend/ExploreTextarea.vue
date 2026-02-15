<script setup lang="ts">
import { ref } from "vue";

defineProps<{
	modelValue: string;
	rows?: number;
	placeholder?: string;
	variant?: "active" | "answered";
}>();

const emit = defineEmits<{
	"update:modelValue": [value: string];
	blur: [];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

function focus(): void {
	textareaRef.value?.focus();
}

function onInput(event: Event): void {
	if (!(event.target instanceof HTMLTextAreaElement)) {
		throw new Error("Expected target to be an HTMLTextAreaElement");
	}
	emit("update:modelValue", event.target.value);
}

defineExpose({ focus });
</script>

<template>
	<textarea ref="textareaRef" :class="variant ?? 'active'" :value="modelValue" :rows="rows ?? 5" :placeholder="placeholder ?? ''" @input="onInput" @blur="emit('blur')"></textarea>
</template>

<style scoped>
textarea.active {
	border: none;
	border-bottom: 1px solid var(--color-gray-400);
	background: var(--color-gray-50);
}

textarea.active:focus {
	border-bottom-color: var(--color-green-600);
	box-shadow: inset 1px 0 0 0 var(--color-green-600);
}

textarea.answered {
	border: none;
	border-bottom: 1px solid transparent;
	background: transparent;
	color: var(--color-gray-600);
	line-height: var(--leading-normal);
}

textarea.answered:hover {
	border-bottom-color: var(--color-gray-200);
}

textarea.answered:focus {
	border-bottom-color: var(--color-green-600);
	box-shadow: inset 1px 0 0 0 var(--color-green-600);
	color: var(--color-black);
	background: var(--color-gray-50);
}
</style>
