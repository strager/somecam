<script setup lang="ts">
import { ref } from "vue";

defineProps<{
	id?: string;
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
	<textarea :id="id" ref="textareaRef" :class="variant ?? 'active'" :value="modelValue" :rows="rows ?? 5" :placeholder="placeholder ?? ''" @input="onInput" @blur="emit('blur')"></textarea>
</template>

<style scoped></style>
