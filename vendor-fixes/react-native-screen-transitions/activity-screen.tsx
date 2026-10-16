// @ts-nocheck -- resolved as the library's own file, see below.
/* eslint-disable */
/**
 * LOCAL FIX (Open Citadel): react-native-screen-transitions@4.0.0's
 * `components/activity/variants/activity-screen.tsx`, with one change: a row
 * whose scene has left the store no longer throws.
 *
 * Why: the library's store provider writes the new snapshot during render and
 * notifies subscribers in a layout effect afterwards. A row for a route that
 * has just been removed can render against that snapshot (on a slow phone,
 * under a burst of updates, say while books sync) before the memoised list
 * above it drops the row, and `scene.descriptor` then throws
 * "Cannot read property 'descriptor' of undefined", which took down the whole
 * stack to the router's error screen on a Galaxy A33. Still unguarded in
 * 4.1.0-rc.0.
 *
 * The row keeps drawing the last scene it had for that one frame (it is about
 * to be unmounted anyway), and draws nothing if it never had one.
 *
 * How it is wired: `metro.config.js` resolves the library's import of this
 * file to this copy, and resolves this copy's relative imports from the
 * original's folder, so every store and context is the library's own module.
 * It lives here and not in `patches/` because `patches/` is a fingerprint
 * input: a patch would change the runtime version, and an over-the-air update
 * carrying the fix could not reach the build it is for.
 *
 * Drop it when upgrading the library past a release that guards the scene.
 */
import type * as React from "react";
import { memo, useRef } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { useDerivedValue } from "react-native-reanimated";
import { useSharedValueState } from "../../../hooks/reanimated/use-shared-value-state";
import { useBlankStackStore } from "../../../providers/stack/blank-stack.provider";
import { AnimationStore } from "../../../stores/animation.store";
import type { StackSceneActivity } from "../../../types/stack.types";
import { ActivityView, type ActivityViewMode } from "../activity-view";
import { DEFAULT_INACTIVE_BEHAVIOR, type InactiveBehavior } from "../helpers";

const PointerEventsByActivity = {
	active: "auto",
	inert: "auto",
	inactive: "none",
	closing: "none",
} satisfies Record<StackSceneActivity, ViewProps["pointerEvents"]>;

interface ActivityScreenProps {
	children: React.ReactNode;
	inactiveBehavior?: InactiveBehavior;
	paintDriverRouteKey?: string;
	hasNestedState?: boolean;
	routeKey: string;
}

export const ActivityScreen = memo(function ActivityScreen({
	children,
	inactiveBehavior,
	paintDriverRouteKey,
	hasNestedState,
	routeKey,
}: ActivityScreenProps) {
	// Compiled as the library is (it is not React Compiler code): the ref
	// written during render below is deliberate.
	"use no memo";
	const storeScene = useBlankStackStore(
		(store) => store.scenesByKey[routeKey],
	);
	// LOCAL FIX: the last scene this row had, for the frame in which the store
	// has already dropped it and the list above has not yet dropped the row.
	const lastScene = useRef(storeScene);
	if (storeScene) {
		lastScene.current = storeScene;
	}
	const scene = storeScene ?? lastScene.current;
	const stackPaintDriverRouteKey = useBlankStackStore((store) =>
		store.paintDriverRouteKeyByRouteKey.get(routeKey),
	);
	const stackInactiveBehavior = (
		scene?.descriptor.options as { inactiveBehavior?: InactiveBehavior }
	)?.inactiveBehavior;
	const resolvedInactiveBehavior =
		inactiveBehavior ?? stackInactiveBehavior ?? DEFAULT_INACTIVE_BEHAVIOR;
	const resolvedPaintDriverRouteKey =
		paintDriverRouteKey ?? stackPaintDriverRouteKey;
	const resolvedHasNestedState =
		hasNestedState ?? (scene ? "state" in scene.route : false);
	const paintDriverAnimations = resolvedPaintDriverRouteKey
		? AnimationStore.getBag(resolvedPaintDriverRouteKey)
		: undefined;

	/**
	 * Avoid hiding inactive content until the screen that exposes it has settled.
	 *
	 * For A(inactive), B(inert), C(active), A's paint depends on C finishing its
	 * transition. Watching B can still leave a brief blank frame, so we wait for
	 * C's progress to reach its settled value of 1 before hiding A.
	 */
	const isPaintDriverSettled = useDerivedValue(() => {
		"worklet";

		if (!paintDriverAnimations) {
			return false;
		}

		return paintDriverAnimations.transitionProgress.get() >= 1;
	});

	const isPaintDriverSettledOnJS = useSharedValueState(isPaintDriverSettled);

	// LOCAL FIX: after every hook, so the hook order never changes.
	if (!scene) {
		return null;
	}

	let activityViewMode: ActivityViewMode =
		scene.activity === "active" ? "normal" : "inert";
	let visible = scene.activity !== "inactive";

	if (scene.activity === "inactive") {
		if (resolvedInactiveBehavior === "keep" || !isPaintDriverSettledOnJS) {
			visible = true;
		} else if (resolvedInactiveBehavior === "pause") {
			activityViewMode = "paused";
			visible = true;
		} else {
			activityViewMode = "paused";
			visible = false;
		}
	}

	const shouldUnmount =
		resolvedInactiveBehavior === "unmount" &&
		scene.activity === "inactive" &&
		!resolvedHasNestedState &&
		isPaintDriverSettledOnJS;

	if (shouldUnmount) {
		return null;
	}

	return (
		<View
			style={StyleSheet.absoluteFill}
			pointerEvents={PointerEventsByActivity[scene.activity]}
			collapsable={false}
		>
			<ActivityView mode={activityViewMode} visible={visible}>
				{children}
			</ActivityView>
		</View>
	);
});
