import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useRdList } from "./useRdList";

const errors = vi.hoisted(() => vi.fn());
vi.mock("../components/message/Message", () => ({ default: { error: errors } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("R&D list request lifecycle", () => {
  it("ignores stale responses, ends loading on failure and supports retry", async () => {
    const pending: { resolve: (data: { data: string[]; total: number }) => void; reject: (error: Error) => void }[] = [];
    const load = vi.fn(() => new Promise<{ data: string[]; total: number }>((resolve, reject) => pending.push({ resolve, reject })));
    const filters = { search: "" };
    let state!: ReturnType<typeof useRdList<string, typeof filters>>;
    function Host({ page }: { page: number }) {
      state = useRdList(load, filters, page, "7", 10);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(<Host page={1} />));
      await act(async () => root.render(<Host page={2} />));
      expect(load).toHaveBeenLastCalledWith({ search: "", page: 2, pageSize: 10, organizationIds: ["7"] });
      await act(async () => pending[1].resolve({ data: ["new"], total: 11 }));
      await act(async () => pending[0].resolve({ data: ["old"], total: 1 }));
      expect(state.data).toEqual(["new"]);
      expect(state.total).toBe(11);
      expect(state.loading).toBe(false);
      await act(async () => {
        void state.refresh();
      });
      await act(async () => pending[2].reject(new Error("offline")));
      expect(state.loading).toBe(false);
      expect(errors).toHaveBeenCalledWith("offline");
      await act(async () => {
        void state.refresh();
      });
      await act(async () => pending[3].resolve({ data: ["retry"], total: 12 }));
      expect(state.data).toEqual(["retry"]);
      await act(async () => {
        void state.refresh();
      });
    } finally {
      await act(async () => root.unmount());
    }
    errors.mockClear();
    await act(async () => pending[4].reject(new Error("unmounted")));
    expect(errors).not.toHaveBeenCalled();
  });
});
