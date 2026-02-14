import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";

import App from "./App.vue";
import ExploreMeaningView from "./ExploreMeaningView.vue";
import ExploreView from "./ExploreView.vue";
import FindMeaningManualView from "./FindMeaningManualView.vue";
import FindMeaningPrioritizeView from "./FindMeaningPrioritizeView.vue";
import FindMeaningView from "./FindMeaningView.vue";
import HomeView from "./HomeView.vue";
import LlmTestView from "./LlmTestView.vue";
import ReportView from "./ReportView.vue";

const router = createRouter({
	history: createWebHistory(),
	scrollBehavior() {
		return { top: 0 };
	},
	routes: [
		{
			path: "/",
			component: HomeView,
		},
		{
			path: "/find-meaning",
			component: FindMeaningView,
		},
		{
			path: "/find-meaning/prioritize",
			component: FindMeaningPrioritizeView,
		},
		{
			path: "/explore",
			component: ExploreView,
		},
		{
			path: "/find-meaning/manual",
			component: FindMeaningManualView,
		},
		{
			path: "/report",
			component: ReportView,
		},
		{
			path: "/explore/:meaningId",
			component: ExploreMeaningView,
		},
		{
			path: "/llm-test",
			component: LlmTestView,
		},
	],
});

createApp(App).use(router).mount("#app");
