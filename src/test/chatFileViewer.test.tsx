import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatFileViewer } from "@/components/assistant/ChatFileViewer";

describe("ChatFileViewer", () => {
  it("shows an image from memory, closes on Escape and releases the link", () => {
    const create = vi.fn(() => "blob:x"), revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const onClose = vi.fn();
    const { unmount } = render(<ChatFileViewer file={new File(["a"], "invoice.png", { type: "image/png" })} onClose={onClose} />);
    expect(screen.getByRole("img", { name: "invoice.png" })).toHaveAttribute("src", "blob:x");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:x");
  });
  it("shows a PDF in a frame and offers download for other files", () => {
    Object.assign(URL, { createObjectURL: () => "blob:y", revokeObjectURL: () => {} });
    const { unmount } = render(<ChatFileViewer file={new File(["a"], "bill.pdf", { type: "application/pdf" })} onClose={() => {}} />);
    expect(document.querySelector("iframe")?.getAttribute("src")).toBe("blob:y");
    unmount();
    render(<ChatFileViewer file={new File(["a"], "sales.xlsx", { type: "application/vnd.ms-excel" })} onClose={() => {}} />);
    expect(screen.getByText("Download sales.xlsx")).toBeInTheDocument();
  });
});
