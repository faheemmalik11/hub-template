import { useState } from "react";

import type { ConnectionTestResult } from "../../adapters/document-sources";

export interface ConnectionTest {
  testing: boolean;
  result: ConnectionTestResult | null;
  test: () => Promise<void>;
}

export function useConnectionTest(
  sourceId: string,
  onTestConnection: ((sourceId: string) => Promise<ConnectionTestResult>) | undefined,
  failedMessage: string,
): ConnectionTest {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);

  return {
    testing,
    result,
    test: async () => {
      if (!onTestConnection) return;
      setTesting(true);
      setResult(null);
      try {
        setResult(await onTestConnection(sourceId));
      } catch {
        setResult({ ok: false, message: failedMessage });
      } finally {
        setTesting(false);
      }
    },
  };
}
