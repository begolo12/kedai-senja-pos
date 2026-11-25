import { expect, test, type Page } from "@playwright/test";

async function loginAs(
  page: Page,
  username: string,
  pin: string,
  storeMatch: string,
) {
  await page.goto("/login");
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="pin"]', pin);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/select-store");
  await page.locator(`button:has-text("${storeMatch}")`).click();
  await page.waitForURL((url) => !url.pathname.includes("/select-store"));
}

async function ensureShiftOpen(page: Page) {
  await page.goto("/shift");
  await expect(page.getByRole("heading", { name: "Shift", exact: true })).toBeVisible();
  const openBtn = page.getByRole("button", { name: "Buka shift" });
  if (await openBtn.isVisible().catch(() => false)) {
    const floatInput = page.locator("#float");
    if (await floatInput.isVisible().catch(() => false)) {
      await floatInput.fill("200000");
    }
    await openBtn.click();
    await expect(page.getByText("Berjalan sekarang")).toBeVisible();
  }
}

test.describe("Kopi Tera Café POS E2E Logic Flows", () => {
  test("1. Auth & 3 Roles: cashier, kitchen (barista), and admin scoping", async ({
    page,
  }) => {
    // Invalid PIN
    await page.goto("/login");
    await page.fill('input[name="username"]', "kasir");
    await page.fill('input[name="pin"]', "9999");
    await page.click('button[type="submit"]');
    await expect(page.getByText("Username atau PIN salah.")).toBeVisible();

    // Cashier: only Kemang visible, lands on /pos, can open /tables & /orders (without Refund), blocked from /products
    await page.fill('input[name="username"]', "kasir");
    await page.fill('input[name="pin"]', "1111");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/select-store");
    await expect(
      page.getByRole("heading", { name: "Kopi Tera — Kemang" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Kopi Tera — Senopati" }),
    ).toHaveCount(0);

    await page.locator('button:has-text("Kemang")').click();
    await page.waitForURL("**/pos");

    await page.goto("/tables");
    await expect(page.getByRole("heading", { name: "Meja", exact: true })).toBeVisible();
    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: "Pesanan", exact: true })).toBeVisible();
    const firstOrderLink = page.locator("tbody tr a").first();
    if (await firstOrderLink.isVisible().catch(() => false)) {
      await firstOrderLink.click();
      await page.waitForURL("**/orders/**");
      await expect(page.getByRole("button", { name: "Refund" })).toHaveCount(0);
    }

    await page.goto("/products");
    await expect(page).not.toHaveURL(/\/products$/);

    // Kitchen / Barista: clear cashier session first, then login -> lands on /kds, blocked from /pos
    await page.context().clearCookies();
    await loginAs(page, "barista", "2222", "Kemang");
    await page.waitForURL("**/kds");
    await expect(page.getByRole("heading", { name: "Dapur", exact: true })).toBeVisible();
    await page.goto("/pos");
    await expect(page).toHaveURL(/\/kds$/);
  });

  test("2. Admin shift open & petty cash expense calculation", async ({ page }) => {
    await loginAs(page, "manajemen", "1234", "Kemang");
    await page.waitForURL("**/");
    await expect(
      page.getByRole("heading", { name: "Ringkasan hari ini" }),
    ).toBeVisible();

    await ensureShiftOpen(page);
    await expect(page.getByText("Berjalan sekarang")).toBeVisible();

    const expenseNote = `E2E Susu UHT ${Date.now()}`;
    await page.locator("#expense-amount").fill("25000");
    await page.locator("#expense-note").fill(expenseNote);
    await page.getByRole("button", { name: "Catat pengeluaran" }).click();
    await expect(page.getByText(expenseNote)).toBeVisible();
  });

  test("3. POS checkout: paid modifiers, service charge, PB1, receipt & stock deduction", async ({
    page,
  }) => {
    await loginAs(page, "manajemen", "1234", "Kemang");
    await ensureShiftOpen(page);
    await page.goto("/pos");
    await expect(page.locator('[data-hydrated="true"]')).toBeVisible();

    const croissantCard = page.locator("button[data-product-id]", {
      hasText: "Butter Croissant",
    });
    await expect(croissantCard).toBeVisible();
    const stockMatch = (await croissantCard.innerText()).match(/Sisa\s+(\d+)/);
    const initialStock = stockMatch ? Number(stockMatch[1]) : 0;
    expect(initialStock).toBeGreaterThan(2);

    // Add Butter Croissant (no modifiers)
    const searchInput = page.getByLabel("Cari produk");
    await searchInput.fill("Butter Croissant");
    await searchInput.press("Enter");
    await expect(page.locator("#ticket")).toContainText("Butter Croissant");

    // Add Iced Cafe Latte with paid modifier Oat Milk (+Rp 6.000)
    await searchInput.fill("Iced Cafe Latte");
    await searchInput.press("Enter");
    await expect(
      page.getByText("Pilih satu atau beberapa modifier, tambah catatan bila perlu."),
    ).toBeVisible();
    await page.getByRole("button", { name: /Oat Milk/ }).click();
    await page.getByRole("button", { name: /Tambahkan/ }).click();
    await expect(page.locator("#ticket")).toContainText("Iced Cafe Latte");
    await expect(page.locator("#ticket")).toContainText("Oat Milk");

    // Increment Butter Croissant qty to 2
    await page.getByRole("button", { name: "Tambah Butter Croissant" }).click();
    await expect(page.getByLabel("Jumlah Butter Croissant")).toHaveValue("2");

    // Verify Service Charge & Pajak lines on ticket
    await expect(page.locator("#ticket")).toContainText("Service 5%");
    await expect(page.locator("#ticket")).toContainText("Pajak 10%");

    // Apply 10% manual discount
    await page.locator("#ticket").getByRole("button", { name: "%" }).click();
    await page.getByLabel("Nilai diskon").fill("10");
    await expect(page.locator("#ticket")).toContainText("Diskon");

    // Complete Cash payment
    await page.locator("#ticket").getByRole("button", { name: "Tunai" }).click();
    const payDialog = page.getByRole("dialog");
    await expect(payDialog).toContainText("Pembayaran");
    await payDialog.getByRole("button", { name: "Terima pembayaran" }).click();

    await page.waitForURL("**/receipt/**");
    await expect(page.getByText("Butter Croissant")).toBeVisible();
    await expect(page.getByText("Iced Cafe Latte")).toBeVisible();
    await expect(page.getByText(/Oat Milk/)).toBeVisible();
    await expect(page.getByText("Service 5%")).toBeVisible();

    // Return to POS and verify stock decremented by 2
    await page.locator('a[href="/pos"]').first().click();
    await page.waitForURL("**/pos");
    await expect(
      page.locator("button[data-product-id]", { hasText: "Butter Croissant" }),
    ).toContainText(`Sisa ${initialStock - 2}`);
  });

  test("4. Dine-in Open Bill -> Add Item on /tables -> KDS Station Filter -> Settle", async ({
    page,
  }) => {
    await loginAs(page, "manajemen", "1234", "Kemang");
    await ensureShiftOpen(page);
    await page.goto("/pos");
    await expect(page.locator('[data-hydrated="true"]')).toBeVisible();

    // Create open bill for Meja 2 with Mineral Water (bar station)
    await page.locator("#ticket").getByRole("button", { name: "Dine-in" }).click();
    const tableSelect = page.getByLabel("Pilih meja");
    const meja2 = await tableSelect.locator("option", { hasText: "Meja 2" }).first().getAttribute("value");
    if (meja2) await tableSelect.selectOption(meja2);

    await page.locator("button[data-product-id]", { hasText: "Mineral Water" }).click();
    await expect(page.locator("#ticket")).toContainText("Mineral Water");
    await page.locator("#ticket").getByRole("button", { name: "Tunai" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Tagih nanti/ }).click();
    await page.waitForURL("**/tables");

    // Add Truffle Fries (kitchen station) as follow-up item on /tables
    const billCard = page.locator("article", { hasText: "Mineral Water" }).first();
    await expect(billCard).toBeVisible();
    await billCard.getByRole("button", { name: "Tambah item" }).click();
    const addDialog = page.getByRole("dialog");
    await addDialog.locator("button", { hasText: "Truffle Fries" }).first().click();
    await addDialog.getByRole("button", { name: /Simpan tambahan/ }).click();
    await expect(billCard).toContainText("Truffle Fries");

    // Check KDS station filter (Barista / Dapur / Semua stasiun)
    await page.goto("/kds");
    await page.getByRole("button", { name: "Dapur", exact: true }).click();
    await expect(page.locator("article", { hasText: "Truffle Fries" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Semua stasiun" }).click();

    const kdsCard = page.locator("article", { hasText: "Truffle Fries" }).first();
    await kdsCard.getByRole("button", { name: "Siap" }).click();
    await kdsCard.getByRole("button", { name: /Sudah diangkat/ }).click();

    // Settle on /tables via QRIS
    await page.goto("/tables");
    const updatedBill = page.locator("article", { hasText: "Truffle Fries" }).first();
    await updatedBill.getByRole("button", { name: "Bayar" }).click();
    const settleDialog = page.getByRole("dialog");
    await settleDialog.getByRole("button", { name: "QRIS" }).click();
    await settleDialog.getByRole("button", { name: "Terima pembayaran" }).click();
    await page.waitForURL("**/receipt/**");
    await expect(page.getByText("Truffle Fries")).toBeVisible();
  });

  test("5. Open Bill Void/Cancel restores product stock", async ({ page }) => {
    await loginAs(page, "manajemen", "1234", "Kemang");
    await ensureShiftOpen(page);
    await page.goto("/pos");
    await expect(page.locator('[data-hydrated="true"]')).toBeVisible();

    const waterCard = page.locator("button[data-product-id]", { hasText: "Mineral Water" });
    const stockMatch = (await waterCard.innerText()).match(/Sisa\s+(\d+)/);
    const beforeStock = stockMatch ? Number(stockMatch[1]) : 0;

    await page.locator("#ticket").getByRole("button", { name: "Dine-in" }).click();
    await waterCard.click();
    await page.locator("#ticket").getByRole("button", { name: "Tunai" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Tagih nanti/ }).click();
    await page.waitForURL("**/tables");

    const billCard = page.locator("article", { hasText: "Mineral Water" }).first();
    await billCard.getByRole("button", { name: "Batalkan" }).click();
    const cancelDialog = page.getByRole("dialog");
    await cancelDialog.locator("textarea").fill("E2E tamu batal");
    await cancelDialog.getByRole("button", { name: "Konfirmasi batalkan" }).click();
    await expect(page.getByText(/dibatalkan\./)).toBeVisible();

    // Verify stock is back to beforeStock
    await page.goto("/pos");
    await expect(
      page.locator("button[data-product-id]", { hasText: "Mineral Water" }),
    ).toContainText(`Sisa ${beforeStock}`);
  });

  test("6. Public Self-Order (/order/kemang) with paid modifier & Admin Refund", async ({
    page,
  }) => {
    await page.goto("/order/kemang");
    await expect(page.getByRole("heading", { name: /Kopi Tera/ })).toBeVisible();
    await page.waitForTimeout(300);
    await page.locator("button", { hasText: "Iced Cafe Latte" }).first().click();
    await page.getByRole("button", { name: /Oat Milk/ }).click();
    await page.getByRole("button", { name: /Tambahkan/ }).click();
    await page.getByRole("button", { name: /Kirim pesanan/ }).click();
    await expect(page.getByRole("heading", { name: "Pesanan masuk" })).toBeVisible();

    // Admin full refund from /orders
    await loginAs(page, "manajemen", "1234", "Kemang");
    await page.goto("/orders");
    const firstCompletedRow = page.locator("tbody tr", { hasText: "Selesai" }).first();
    await expect(firstCompletedRow).toBeVisible();
    await firstCompletedRow.locator("a").first().click();
    await page.waitForURL("**/orders/**");

    await page.getByRole("button", { name: "Refund" }).click();
    const refundDialog = page.getByRole("dialog");
    await refundDialog.getByRole("button", { name: /Pilih semua/i }).click();
    await refundDialog.locator("#refund-reason").fill("E2E test refund");
    await refundDialog.getByRole("button", { name: "Refund", exact: true }).click();
    await expect(page.getByText("Pesanan direfund penuh.")).toBeVisible();
  });

  test("7. Inventory stock adjustment & movement audit log", async ({ page }) => {
    await loginAs(page, "manajemen", "1234", "Kemang");
    await page.goto("/inventory");

    const row = page.locator("tbody tr", { hasText: "Butter Croissant" }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Sesuaikan" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#qty").fill("5");
    const note = `E2E Restock ${Date.now()}`;
    await dialog.locator("#note").fill(note);
    await dialog.getByRole("button", { name: "Simpan penyesuaian" }).click();
    await expect(page.getByText(note)).toBeVisible();
  });

  test("8. Voucher creation & redemption at POS checkout", async ({ page }) => {
    await loginAs(page, "manajemen", "1234", "Kemang");
    await ensureShiftOpen(page);
    await page.goto("/vouchers");

    const code = `E2E${String(Date.now()).slice(-5)}`;
    await page.getByRole("button", { name: "Voucher baru" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#v-code").fill(code);
    await dialog.getByLabel("Nilai voucher").fill("20");
    await dialog.locator('button[type="submit"]').click();
    await expect(page.getByText(code)).toBeVisible();

    await page.goto("/pos");
    await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
    await page.locator("button[data-product-id]", { hasText: "Mineral Water" }).click();
    await page.getByLabel("Kode voucher").fill(code);
    await page.locator("#ticket").getByRole("button", { name: "Pakai" }).click();
    await expect(page.locator("#ticket")).toContainText(`Voucher ${code}`);

    await page.locator("#ticket").getByRole("button", { name: "Tunai" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Terima pembayaran" }).click();
    await page.waitForURL("**/receipt/**");
    await expect(page.getByText("Mineral Water")).toBeVisible();
  });

  test("9. Reports summary & CSV export endpoint", async ({ page }) => {
    await loginAs(page, "manajemen", "1234", "Kemang");
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Laporan" })).toBeVisible();

    const res = await page.request.get("/api/reports/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect((await res.text()).length).toBeGreaterThan(10);
  });

  test("10. Responsive zero-overflow & zero uncaught page errors across all 16 routes", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await loginAs(page, "manajemen", "1234", "Kemang");
    for (const route of [
      "/",
      "/pos",
      "/kds",
      "/orders",
      "/tables",
      "/products",
      "/inventory",
      "/purchases",
      "/customers",
      "/tiers",
      "/vouchers",
      "/staff",
      "/stores",
      "/settings",
      "/reports",
      "/shift",
    ]) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route);
      await page.waitForLoadState("load");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow, `Mobile horizontal overflow on ${route}`).toBe(false);
    }
    expect(pageErrors).toEqual([]);
  });
});
