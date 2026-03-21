import { ProfileConnectionList } from "../../../components/profile-connection-list";
import { useLocalSearchParams } from "expo-router";

export default function FollowingScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  return <ProfileConnectionList kind="following" ownerUserId={userId ?? ""} />;
}
