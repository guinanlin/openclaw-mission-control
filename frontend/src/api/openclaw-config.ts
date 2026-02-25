import { customFetch } from "./mutator";

export type ConfigTreeNode = {
  name: string;
  type: "dir" | "file";
  children: ConfigTreeNode[] | null;
};

export type ConfigTreeResponse = {
  root: string;
  tree: ConfigTreeNode;
};

type ApiResponse<T> = { data: T; status: number; headers: Headers };

export async function getConfigTree(): Promise<ConfigTreeResponse> {
  const response = await customFetch<ApiResponse<ConfigTreeResponse>>(
    "/api/v1/openclaw/config-tree",
    { method: "GET" },
  );
  return response.data;
}
