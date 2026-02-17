import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";

import App from "./App.vue";
import { initAnalytics } from "./analytics.ts";
import "./global.css";
import ExploreMeaningView from "./ExploreMeaningView.vue";
import ExploreView from "./ExploreView.vue";
import FindMeaningManualView from "./FindMeaningManualView.vue";
import FindMeaningPrioritizeView from "./FindMeaningPrioritizeView.vue";
import FindMeaningView from "./FindMeaningView.vue";
import HomeView from "./HomeView.vue";
import LlmTestView from "./LlmTestView.vue";
import PrivacyView from "./PrivacyView.vue";
import ReportView from "./ReportView.vue";
import StyleGuideView from "./StyleGuideView.vue";

const router = createRouter({
	history: createWebHistory(),
	scrollBehavior(_to, _from, savedPosition) {
		if (savedPosition !== null) {
			return savedPosition;
		}
		return { top: 0 };
	},
	routes: [
		{
			path: "/",
			name: "home",
			component: HomeView,
		},
		{
			path: "/:sessionId/find-meaning",
			name: "findMeaning",
			component: FindMeaningView,
		},
		{
			path: "/:sessionId/find-meaning/prioritize",
			name: "findMeaningPrioritize",
			component: FindMeaningPrioritizeView,
		},
		{
			path: "/:sessionId/explore",
			name: "explore",
			component: ExploreView,
		},
		{
			path: "/:sessionId/find-meaning/manual",
			name: "findMeaningManual",
			component: FindMeaningManualView,
		},
		{
			path: "/:sessionId/report",
			name: "report",
			component: ReportView,
		},
		{
			path: "/:sessionId/explore/:meaningId",
			name: "exploreMeaning",
			component: ExploreMeaningView,
		},
		{
			path: "/privacy",
			name: "privacy",
			component: PrivacyView,
		},
		{
			path: "/llm-test",
			name: "llmTest",
			component: LlmTestView,
		},
		{
			path: "/style-guide",
			name: "styleGuide",
			component: StyleGuideView,
		},
	],
});

initAnalytics(router);
createApp(App).use(router).mount("#app");
