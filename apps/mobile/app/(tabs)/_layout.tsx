import { Tabs, Redirect, router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedBottomSheetFrame } from "../../components/animated-bottom-sheet-frame";
import { HeaderProfileIcon } from "../../components/header-profile-icon";
import { NotificationMustardDot } from "../../components/notification-mustard-dot";
import { ParfadeLogo } from "../../components/parfade-logo";
import { apiGet } from "../../lib/api";
import { isMeProfileStale, setCachedMeProfile, type MeProfile } from "../../lib/me-profile-cache";
import { useChatUnread } from "../../lib/chat-unread-context";
import { useNotificationBadge } from "../../lib/notification-badge-context";
import { colors } from "../../lib/theme";

export default function TabsLayout() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { showBadge: showNotificationBadge } = useNotificationBadge();
  const { hasAnyUnreadChat } = useChatUnread();
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const showAdvancedCreateTypes = false;
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (!isSignedIn) return;
    if (!isMeProfileStale()) return;
    (async () => {
      try {
        const token = await getTokenRef.current();
        const data = await apiGet<{ user: MeProfile }>("/api/users/me", token);
        setCachedMeProfile(data.user);
      } catch {
        // ignore
      }
    })();
  }, [isSignedIn]);

  if (!isLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.fairway} />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)" />;
  }

  function openCreateSheet() {
    setCreateSheetOpen(true);
  }

  function closeCreateSheet() {
    setCreateSheetOpen(false);
  }

  function goToCreateOption(option: "planning" | "scheduled" | "tournament" | "event") {
    closeCreateSheet();
    setTimeout(() => {
      router.push({
        pathname: "/create",
        params: { mode: option, session: String(Date.now()) },
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
          headerTitle: () => <ParfadeLogo compact />,
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
            headerRight: () => <HeaderProfileIcon />,
            headerRightContainerStyle: { paddingRight: 12 },
          }}
        />
        <Tabs.Screen
          name="rounds"
          options={{
            title: "My Rounds",
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.tabIconWrap}>
                <Ionicons name={focused ? "list" : "list-outline"} size={22} color={color} />
                {showNotificationBadge || hasAnyUnreadChat ? (
                  <NotificationMustardDot style={styles.tabBarNotificationDot} />
                ) : null}
              </View>
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
          name="games"
          options={{
            title: "Games",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "flag" : "flag-outline"} size={22} color={color} />
            ),
            headerRight: () => <HeaderProfileIcon />,
            headerRightContainerStyle: { paddingRight: 12 },
          }}
        />
        <Tabs.Screen
          name="groups"
          options={{
            title: "Groups",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "people" : "people-outline"}
                size={22}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            href: null,
          }}
        />
      </Tabs>

      <AnimatedBottomSheetFrame
        visible={createSheetOpen}
        onClose={closeCreateSheet}
        sheetStyle={styles.createSheetSurface}
        backdropAccessibilityLabel="Dismiss create options"
      >
        <Text style={styles.sheetTitle}>What do you want to create?</Text>
        <Text style={styles.sheetSub}>Choose a format to get started.</Text>

        <Pressable style={styles.optionRow} onPress={() => goToCreateOption("planning")}>
          <View style={styles.optionIconWrap}>
            <Ionicons name="people-outline" size={18} color={colors.fairway} />
          </View>
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionTitle}>Planning round</Text>
            <Text style={styles.optionSubtitle}>Find players first, lock details later.</Text>
          </View>
        </Pressable>

        <Pressable style={styles.optionRow} onPress={() => goToCreateOption("scheduled")}>
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
            <Pressable style={styles.optionRow} onPress={() => goToCreateOption("tournament")}>
              <View style={styles.optionIconWrap}>
                <Ionicons name="trophy-outline" size={18} color={colors.fairway} />
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>Tournament</Text>
                <Text style={styles.optionSubtitle}>Placeholder flow for upcoming support.</Text>
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
      </AnimatedBottomSheetFrame>
    </>
  );
}

const styles = StyleSheet.create({
  tabIconWrap: {
    position: "relative",
    width: 32,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBarNotificationDot: {
    top: -1,
    right: 2,
  },
  createSheetSurface: {
    paddingHorizontal: 16,
    paddingTop: 14,
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
