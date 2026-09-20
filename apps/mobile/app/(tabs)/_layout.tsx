import { Tabs } from 'expo-router'
import { TabBar } from '~/ui/TabBar'
import { tabScene, tabSceneReduced, tabTransitionSpec } from '~/ui/tabScene'
import { useReducedMotion } from '~/ui/motion'

export default function TabsLayout() {
  // The navigator animates with React Native's own driver, which — unlike Reanimated — does not
  // check the accessibility setting on its own. So it is checked here and the interpolator that
  // drops the sideways travel is handed in instead.
  const reduced = useReducedMotion()

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // The navigator ships 'fade' and 'shift'; 'shift' is the right idea at the wrong
        // numbers — 50pt over 150ms on `inOut(ease)`, which is a pop rather than a move and
        // on a curve nothing else in this app uses. Supplying both the interpolator and the
        // spec replaces them with the project's own, and is enough on its own to turn the
        // animation on: the navigator treats a transitionSpec as the opt-in.
        sceneStyleInterpolator: reduced ? tabSceneReduced : tabScene,
        transitionSpec: tabTransitionSpec,
      }}
    >
      <Tabs.Screen name="spend" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="uday" />
      <Tabs.Screen name="grow" />
      <Tabs.Screen name="protect" />
    </Tabs>
  )
}
