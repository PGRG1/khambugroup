import { describe, expect, it } from "vitest";
import { deliveryPhotoPath, usableDeliveryPhotos } from "@/utils/deliveryPhotos";

describe("delivery photos", () => {
  it("stores photos in the tenant's folder under the invoice", () => {
    expect(deliveryPhotoPath("t1", "inv1", "IMG_0042.JPG", "abc")).toBe("t1/delivery/inv1/abc.jpg");
    expect(deliveryPhotoPath("t1", "inv1", "photo", "abc")).toBe("t1/delivery/inv1/abc.photo");
  });
  it("keeps only images up to 15 MB", () => {
    const img = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const pdf = new File(["x"], "a.pdf", { type: "application/pdf" });
    const empty = new File([], "b.png", { type: "image/png" });
    expect(usableDeliveryPhotos([img, pdf, empty])).toEqual([img]);
  });
});
