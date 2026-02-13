import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";

import App from "./App.vue";
import CardSwipeView from "./CardSwipeView.vue";
import ChosenCardsView from "./ChosenCardsView.vue";
import EditCardsView from "./EditCardsView.vue";
import ExploreView from "./ExploreView.vue";
import HomeView from "./HomeView.vue";
import LlmTestView from "./LlmTestView.vue";
import NarrowDownView from "./NarrowDownView.vue";
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
			path: "/cards",
			component: CardSwipeView,
		},
		{
			path: "/narrow-down",
			component: NarrowDownView,
		},
		{
			path: "/chosen",
			component: ChosenCardsView,
		},
		{
			path: "/edit-cards",
			component: EditCardsView,
		},
		{
			path: "/report",
			component: ReportView,
		},
		{
			path: "/explore/:cardId",
			component: ExploreView,
		},
		{
			path: "/llm-test",
			component: LlmTestView,
		},
	],
});

createApp(App).use(router).mount("#app");
