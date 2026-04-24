import { Text, View } from "react-native";
import type { TaskDetail } from "@dragons/shared";

interface Props {
  task: TaskDetail;
  boardId: number;
}

export function TaskDetailBody({ task }: Props) {
  return (
    <View style={{ padding: 16 }}>
      <Text>{task.title}</Text>
    </View>
  );
}
