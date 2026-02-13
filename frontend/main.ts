import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";

import App from "./App.vue";
import CardSwipeView from "./CardSwipeView.vue";
import ChosenCardsView from "./ChosenCardsView.vue";
import ExploreView from "./ExploreView.vue";
import HomeView from "./HomeView.vue";
import NarrowDownView from "./NarrowDownView.vue";

const router = createRouter({
	history: createWebHistory(),
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
			path: "/explore/:cardId",
			component: ExploreView,
		},
	],
});

createApp(App).use(router).mount("#app");
