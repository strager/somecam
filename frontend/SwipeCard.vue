<script setup lang="ts">
import { computed, ref } from "vue";

import type { MeaningCard } from "../shared/meaning-cards";
import type { SwipeDirection } from "../shared/meaning-cards";

defineProps<{
	card: MeaningCard;
}>();

const emit = defineEmits<{
	swiped: [direction: SwipeDirection];
}>();

const SWIPE_THRESHOLD = 100;
const FLY_AWAY_DURATION_MS = 800;

const isDragging = ref(false);
const startX = ref(0);
const startY = ref(0);
const offsetX = ref(0);
const offsetY = ref(0);
const flyingAway = ref(false);
const flyX = ref(0);
const flyY = ref(0);
const flyDirection = ref<SwipeDirection | null>(null);
const flyDurationMs = ref(FLY_AWAY_DURATION_MS);

const dominantDirection = computed<SwipeDirection | null>(() => {
	const ax = Math.abs(offsetX.value);
	const ay = Math.abs(offsetY.value);
	if (ax < 10 && ay < 10) return null;
	if (ax >= ay) {
		return offsetX.value > 0 ? "agree" : "disagree";
	}
	return "unsure";
});

const pastThreshold = computed(() => {
	const ax = Math.abs(offsetX.value);
	const ay = Math.abs(offsetY.value);
	return Math.max(ax, ay) >= SWIPE_THRESHOLD;
});

const DIRECTION_COLORS: Record<SwipeDirection, string> = {
	agree: "42, 110, 78",
	disagree: "200, 60, 60",
	unsure: "107, 114, 128",
};

const overlayColor = computed(() => {
	let dir: SwipeDirection | null;
	let opacity: number;
	if (flyingAway.value) {
		dir = flyDirection.value;
		opacity = 0.25;
	} else if (isDragging.value) {
		dir = dominantDirection.value;
		const ax = Math.abs(offsetX.value);
		const ay = Math.abs(offsetY.value);
		const dist = Math.max(ax, ay);
		opacity = Math.min(dist / SWIPE_THRESHOLD, 1) * 0.25;
	} else {
		return "transparent";
	}
	if (dir === null) return "transparent";
	return `rgba(${DIRECTION_COLORS[dir]}, ${String(opacity)})`;
});

const labelOpacity = computed(() => {
	if (flyingAway.value) return 1;
	if (!isDragging.value) return 0;
	const ax = Math.abs(offsetX.value);
	const ay = Math.abs(offsetY.value);
	const dist = Math.max(ax, ay);
	return Math.min(Math.max((dist - 30) / (SWIPE_THRESHOLD - 30), 0), 1);
});

const cardShadow = computed(() => {
	if (flyingAway.value) return "0 4px 20px rgba(0, 0, 0, 0.12)";
	if (!isDragging.value) return undefined;
	const dist = Math.max(Math.abs(offsetX.value), Math.abs(offsetY.value));
	const shadowOpacity = Math.min(dist / SWIPE_THRESHOLD, 1) * 0.12;
	return `0 4px 20px rgba(0, 0, 0, ${String(shadowOpacity)})`;
});

const cardStyle = computed(() => {
	if (flyingAway.value) {
		const rotate = flyX.value * 0.08;
		return {
			transform: `translate(${String(flyX.value)}px, ${String(flyY.value)}px) rotate(${String(rotate)}deg)`,
			opacity: "0",
			boxShadow: cardShadow.value,
			transition: `transform ${String(flyDurationMs.value)}ms ease, opacity ${String(flyDurationMs.value)}ms ease`,
		};
	}
	if (!isDragging.value) {
		return { transition: "transform 0.3s ease", boxShadow: cardShadow.value };
	}
	const rotate = offsetX.value * 0.08;
	return {
		transform: `translate(${String(offsetX.value)}px, ${String(offsetY.value)}px) rotate(${String(rotate)}deg)`,
		transition: "none",
		boxShadow: cardShadow.value,
	};
});

function onPointerDown(e: PointerEvent): void {
	if (flyingAway.value) return;
	isDragging.value = true;
	startX.value = e.clientX;
	startY.value = e.clientY;
	offsetX.value = 0;
	offsetY.value = 0;
	(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
	if (!isDragging.value) return;
	offsetX.value = e.clientX - startX.value;
	offsetY.value = e.clientY - startY.value;
}

function onPointerUp(): void {
	if (!isDragging.value) return;
	isDragging.value = false;

	if (pastThreshold.value && dominantDirection.value !== null) {
		flyAway(dominantDirection.value, 300);
	} else {
		offsetX.value = 0;
		offsetY.value = 0;
	}
}

function flyAway(direction: SwipeDirection, durationMs = FLY_AWAY_DURATION_MS): void {
	flyingAway.value = true;
	flyDirection.value = direction;
	flyDurationMs.value = durationMs;
	flyX.value = direction === "agree" ? 600 : direction === "disagree" ? -600 : 0;
	flyY.value = direction === "unsure" ? (offsetY.value >= 0 ? 400 : -400) : 0;

	globalThis.setTimeout(() => {
		emit("swiped", direction);
	}, durationMs);
}

defineExpose({ flyAway });
</script>

<template>
	<div class="card-surface swipe-card" :style="cardStyle" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp">
		<div class="card-overlay" :style="{ background: overlayColor }" />
		<span v-if="dominantDirection === 'agree' || flyDirection === 'agree'" class="direction-label agree" :style="{ opacity: labelOpacity }"> Agree </span>
		<span v-if="dominantDirection === 'disagree' || flyDirection === 'disagree'" class="direction-label disagree" :style="{ opacity: labelOpacity }"> Disagree </span>
		<span v-if="dominantDirection === 'unsure' || flyDirection === 'unsure'" class="direction-label unsure" :style="{ opacity: labelOpacity }"> Unsure </span>
		<p class="card-text">{{ card.description }}</p>
	</div>
</template>

<style>
.card-surface {
	width: 100%;
	max-width: 20rem;
	min-height: 14rem;
	padding: 2rem;
	border-radius: 12px;
	background: #fff;
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}
</style>

<style scoped>
.swipe-card {
	position: relative;
	margin: 0 auto;
	display: flex;
	align-items: center;
	justify-content: center;
	text-align: center;
	cursor: grab;
	user-select: none;
	touch-action: none;
	overflow: hidden;
}

.swipe-card:active {
	cursor: grabbing;
}

.card-overlay {
	position: absolute;
	inset: 0;
	border-radius: 12px;
	pointer-events: none;
	transition: background 0.1s ease;
}

.direction-label {
	position: absolute;
	top: 1rem;
	font-size: 1.1rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	pointer-events: none;
}

.direction-label.agree {
	right: 1rem;
	color: #2a6e4e;
}

.direction-label.disagree {
	left: 1rem;
	color: #c83c3c;
}

.direction-label.unsure {
	left: 50%;
	transform: translateX(-50%);
	color: #6b7280;
}

@keyframes fade-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

.card-text {
	font-size: 1.2rem;
	line-height: 1.6;
	margin: 0;
	color: #1a1a1a;
	animation: fade-in 0.3s ease;
	position: relative;
	z-index: 1;
}
</style>
