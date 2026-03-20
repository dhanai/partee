import { Tabs, Redirect, router } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { ParteeLogo } from "../../components/partee-logo";
import { colors } from "../../lib/theme";

export default function TabsLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const [createSheetMounted, setCreateSheetMounted] = useState(false);
  const showAdvancedCreateTypes = false;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(42)).current;

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)" />;
  }

  function openCreateSheet() {
    setCreateSheetMounted(true);
    backdropOpacity.setValue(0);
    sheetTranslateY.setValue(42);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 190,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function closeCreateSheet() {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 42,
        duration: 190,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setCreateSheetMounted(false);
      }
    });
  }

  function goToCreateOption(option: "planning" | "scheduled" | "tournament" | "event") {
    closeCreateSheet();
    setTimeout(() => {
      router.push({
        pathname: "/create",
        params: { mode: option },
      });
    }, 0);
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerTitleAlign: "left",
          headerTitleContainerStyle: {
            paddingLeft: 0,
          },
          headerTitle: () => <ParteeLogo compact />,
          tabBarActiveTintColor: colors.fairway,
          tabBarInactiveTintColor: colors.muted,
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
            marginBottom: 2,
          },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: 66,
            paddingTop: 6,
            paddingHorizontal: 10,
          },
          tabBarItemStyle: {
            borderRadius: 10,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Discover",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "compass" : "compass-outline"}
                size={20}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="rounds"
          options={{
            title: "My Rounds",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "list" : "list-outline"} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="create"
          options={{
            title: "Create",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "add-circle" : "add-circle-outline"}
                size={22}
                color={color}
              />
            ),
          }}
          listeners={{
            tabPress: (event) => {
              event.preventDefault();
              openCreateSheet();
            },
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "person-circle" : "person-circle-outline"}
                size={22}
                color={color}
              />
            ),
          }}
        />
      </Tabs>

      <Modal visible={createSheetMounted} transparent animationType="none">
        <View style={styles.sheetRoot}>
          <Animated.View
            pointerEvents="none"
            style={[styles.sheetBackdropTint, { opacity: backdropOpacity }]}
          />
          <Pressable style={styles.sheetBackdropPressable} onPress={closeCreateSheet}>
            <Animated.View
              style={[styles.sheetCardWrap, { transform: [{ translateY: sheetTranslateY }] }]}
            >
              <Pressable style={styles.sheetCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.sheetTitle}>What do you want to create?</Text>
            <Text style={styles.sheetSub}>Choose a format to get started.</Text>

            <Pressable
              style={styles.optionRow}
              onPress={() => goToCreateOption("planning")}
            >
              <View style={styles.optionIconWrap}>
                <Ionicons name="people-outline" size={18} color={colors.fairway} />
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>Planning round</Text>
                <Text style={styles.optionSubtitle}>Find players first, lock details later.</Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.optionRow}
              onPress={() => goToCreateOption("scheduled")}
            >
              <View style={styles.optionIconWrap}>
                <Ionicons name="golf-outline" size={18} color={colors.fairway} />
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>Scheduled tee time</Text>
                <Text style={styles.optionSubtitle}>Set course and tee time now.</Text>
              </View>
            </Pressable>

            {showAdvancedCreateTypes ? (
              <>
                <Pressable
                  style={styles.optionRow}
                  onPress={() => goToCreateOption("tournament")}
                >
                  <View style={styles.optionIconWrap}>
                    <Ionicons name="trophy-outline" size={18} color={colors.fairway} />
                  </View>
                  <View style={styles.optionTextWrap}>
                    <Text style={styles.optionTitle}>Tournament</Text>
                    <Text style={styles.optionSubtitle}>
                      Placeholder flow for upcoming support.
                    </Text>
                  </View>
                </Pressable>

                <Pressable style={styles.optionRow} onPress={() => goToCreateOption("event")}>
                  <View style={styles.optionIconWrap}>
                    <Ionicons name="sparkles-outline" size={18} color={colors.fairway} />
                  </View>
                  <View style={styles.optionTextWrap}>
                    <Text style={styles.optionTitle}>Event</Text>
                    <Text style={styles.optionSubtitle}>
                      Meetup, market, tournament side-event and more.
                    </Text>
                  </View>
                </Pressable>
              </>
            ) : null}
              </Pressable>
            </Animated.View>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sheetRoot: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetBackdropTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  sheetBackdropPressable: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetCardWrap: {
    justifyContent: "flex-end",
  },
  sheetCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 10,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  sheetSub: {
    color: colors.muted,
    marginBottom: 2,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#faf8f5",
    padding: 10,
  },
  optionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.fairwaySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTextWrap: { flex: 1, gap: 2 },
  optionTitle: { color: colors.text, fontWeight: "700" },
  optionSubtitle: { color: colors.muted, fontSize: 12 },
});
