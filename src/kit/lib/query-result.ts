export interface QueryResult<Data> {
  data: Data | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isRefreshing: boolean;
  refetch: () => void;
}

export interface MutationResult<Input> {
  run: (input: Input) => void;
  isPending: boolean;
}
