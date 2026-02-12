import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";

import App from "./App.vue";
import CardSwipeView from "./CardSwipeView.vue";
import HomeView from "./HomeView.vue";

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
	],
});

createApp(App).use(router).mount("#app");
