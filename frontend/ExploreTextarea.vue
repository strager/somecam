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
	emit("update:modelValue", (event.target as HTMLTextAreaElement).value);
}

defineExpose({ focus });
</script>

<template>
	<textarea ref="textareaRef" :class="variant ?? 'active'" :value="modelValue" :rows="rows ?? 5" :placeholder="placeholder ?? ''" @input="onInput" @blur="emit('blur')"></textarea>
</template>

<style scoped>
textarea {
	width: 100%;
	padding: 0.75rem;
	font-size: 1rem;
	font-family: inherit;
	border-radius: 6px;
	resize: vertical;
	box-sizing: border-box;
}

textarea.active {
	border: 1px solid #ccc;
	background: #fff;
}

textarea.active:focus {
	outline: none;
	border-color: #2a6e4e;
	box-shadow: 0 0 0 2px rgba(42, 110, 78, 0.2);
}

textarea.answered {
	border: 1px solid transparent;
	background: transparent;
	color: #555;
	line-height: 1.5;
}

textarea.answered:hover {
	border-color: #e0e0e0;
}

textarea.answered:focus {
	outline: none;
	border-color: #2a6e4e;
	box-shadow: 0 0 0 2px rgba(42, 110, 78, 0.2);
	color: #1a1a1a;
	background: #fff;
}
</style>
