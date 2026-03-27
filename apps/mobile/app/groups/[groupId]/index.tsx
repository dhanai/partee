import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Universal link redirect: shared URLs use /groups/{id} (plural)
 * but the real screen lives at /group/{id} (singular).
 */
export default function GroupsRedirect() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <Redirect href={`/group/${groupId}`} />;
}
