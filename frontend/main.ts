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
			path: "/:sessionId/find-meaning",
			component: FindMeaningView,
		},
		{
			path: "/:sessionId/find-meaning/prioritize",
			component: FindMeaningPrioritizeView,
		},
		{
			path: "/:sessionId/explore",
			component: ExploreView,
		},
		{
			path: "/:sessionId/find-meaning/manual",
			component: FindMeaningManualView,
		},
		{
			path: "/:sessionId/report",
			component: ReportView,
		},
		{
			path: "/:sessionId/explore/:meaningId",
			component: ExploreMeaningView,
		},
		{
			path: "/llm-test",
			component: LlmTestView,
		},
	],
});

createApp(App).use(router).mount("#app");
