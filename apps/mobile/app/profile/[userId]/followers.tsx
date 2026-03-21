import { ProfileConnectionList } from "../../../components/profile-connection-list";
import { useLocalSearchParams } from "expo-router";

export default function FollowersScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  return <ProfileConnectionList kind="followers" ownerUserId={userId ?? ""} />;
}
