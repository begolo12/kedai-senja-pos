import { expect, test, type Page } from "@playwright/test";

async function loginAs(
  page: Page,
  username: string,
  pin: string,
  storeMatch?: string,
) {
  await page.goto("/login");
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="pin"]', pin);
  await page.getByRole("button", { name: "Masuk ke kasir" }).click();
  if (storeMatch) {
    await page.waitForURL("**/select-store");
    await page.locator(`button:has-text("${storeMatch}")`).click();
    await page.waitForURL((url) => !url.pathname.includes("/select-store"));
  }
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
  test("1. Auth & Roles: cashier, kitchen (barista), and demo owner scoping", async ({
    page,
  }) => {
    // Invalid PIN
    await page.goto("/login");
    await page.fill('input[name="username"]', "kasir");
    await page.fill('input[name="pin"]', "9999");
    await page.getByRole("button", { name: "Masuk ke kasir" }).click();
    await expect(page.getByText("Username atau PIN salah.")).toBeVisible();

    // Cashier: only Kemang visible, lands on /pos, can open /tables & /orders (without Refund), blocked from /products and /admin
    await page.fill('input[name="username"]', "kasir");
    await page.fill('input[name="pin"]', "123456");
    await page.getByRole("button", { name: "Masuk ke kasir" }).click();
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
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin$/);

    // Kitchen / Barista: clear cashier session first, then login -> lands on /kds, blocked from /pos & /admin
    await page.context().clearCookies();
    await loginAs(page, "barista", "2222", "Kemang");
    await page.waitForURL("**/kds");
    await expect(page.getByRole("heading", { name: "Dapur", exact: true })).toBeVisible();
    await page.goto("/pos");
    await expect(page).toHaveURL(/\/kds$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/kds$/);
  });

  test("2. Demo owner shift open & petty cash expense calculation", async ({ page }) => {
    await loginAs(page, "demo", "demo123", "Kemang");
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
    await loginAs(page, "demo", "demo123", "Kemang");
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
    await loginAs(page, "demo", "demo123", "Kemang");
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
    await loginAs(page, "demo", "demo123", "Kemang");
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

  test("6. Public Self-Order (/order/kemang) with paid modifier & Manager Refund", async ({
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

    // Manager full refund from /orders
    await loginAs(page, "demo", "demo123", "Kemang");
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
    await loginAs(page, "demo", "demo123", "Kemang");
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
    await loginAs(page, "demo", "demo123", "Kemang");
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
    await loginAs(page, "demo", "demo123", "Kemang");
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Laporan" })).toBeVisible();

    const res = await page.request.get("/api/reports/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect((await res.text()).length).toBeGreaterThan(10);
  });

  test("10. Responsive zero-overflow & zero uncaught page errors across POS & Back Office routes", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await loginAs(page, "demo", "demo123", "Kemang");
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

    await page.context().clearCookies();
    await loginAs(page, "admin", "admin123");
    await page.waitForURL("**/admin");
    for (const route of ["/admin", "/admin/accounts", "/admin/stores"]) {
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

  test("11. Shared persistent Demo account, store lock, and Back Office isolation", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Coba Akun Demo" }).click();
    await page.waitForURL("**/select-store");
    await expect(page.getByRole("heading", { name: "Kopi Tera — Kemang" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Kopi Tera — Senopati" })).toBeVisible();

    await page.locator('button:has-text("Kemang")').click();
    await page.waitForURL("**/");
    await expect(page.getByText("Demo", { exact: true }).first()).toBeVisible();

    // Demo can use POS management pages, but cannot create stores on /stores or open /admin
    await page.goto("/stores");
    await expect(page.getByRole("button", { name: "Toko baru" })).toHaveCount(0);

    await page.goto("/customers");
    await expect(page.getByRole("heading", { name: "Pelanggan", exact: true })).toBeVisible();

    const demoCustomer = `Tamu Demo ${Date.now()}`;
    await page.getByRole("button", { name: "Pelanggan baru" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#c-name").fill(demoCustomer);
    await dialog.getByRole("button", { name: "Tambah pelanggan" }).click();
    await expect(page.getByText(demoCustomer)).toBeVisible();

    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin$/);

    // Log out & log back in as demo -> data persists
    await page.context().clearCookies();
    await loginAs(page, "demo", "demo123", "Kemang");
    await page.goto("/customers");
    await expect(page.getByText(demoCustomer)).toBeVisible();
  });

  test("12. Admin Back Office: separate login, create ID with subscription, renew, and enforce expiry", async ({
    page,
  }) => {
    // Admin lands directly on /admin (Back Office), NOT /select-store or /pos
    await loginAs(page, "admin", "admin123");
    await page.waitForURL("**/admin");
    await expect(page.getByRole("heading", { name: "Pusat Kontrol Langganan" })).toBeVisible();

    await page.goto("/admin/accounts");
    await expect(page.getByRole("heading", { name: "Akun & Langganan" })).toBeVisible();

    const suffix = String(Date.now()).slice(-6);
    const newUsername = `teman${suffix}`;
    const newStoreName = `Kedai Teman ${suffix}`;

    await page.getByRole("button", { name: "Buat ID Baru" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#s-name").fill(`Teman ${suffix}`);
    await dialog.locator("#s-username").fill(newUsername);
    await dialog.locator("#s-role").selectOption("owner");
    await dialog.locator("#s-pin").fill("teman123");
    await dialog.getByRole("button", { name: "3 Bln" }).click();
    await dialog.locator("#s-note").fill("WA 081200001111");
    await dialog.getByPlaceholder(/Nama toko baru/i).fill(newStoreName);
    await dialog.getByRole("button", { name: "Tambah ID" }).click();

    const row = page.locator("tbody tr", { hasText: `@${newUsername}` });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Aktif");

    // Admin extends subscription by +1 Tahun
    await row.getByRole("button", { name: "Perpanjang" }).click();
    const renewDialog = page.getByRole("dialog");
    await renewDialog.getByRole("button", { name: "+1 Tahun" }).click();
    await renewDialog.getByRole("button", { name: "Simpan Perpanjangan" }).click();
    await expect(page.getByText(/diperpanjang hingga/)).toBeVisible();

    // Admin manually expires the account to test enforcement
    await row.getByRole("button", { name: "Perpanjang" }).click();
    const expireDialog = page.getByRole("dialog");
    await expireDialog.getByRole("button", { name: "Hentikan masa aktif sekarang" }).click();
    await expireDialog.getByRole("button", { name: "Simpan Perpanjangan" }).click();
    await expect(row).toContainText("Kedaluwarsa");

    // Expired customer cannot log in
    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[name="username"]', newUsername);
    await page.fill('input[name="pin"]', "teman123");
    await page.getByRole("button", { name: "Masuk ke kasir" }).click();
    await expect(page.getByText(/Masa aktif akun berakhir/)).toBeVisible();

    // Admin renews the expired account by +1 Bulan -> customer can log in again & open every POS feature
    await loginAs(page, "admin", "admin123");
    await page.waitForURL("**/admin");
    await page.goto("/admin/accounts");
    const expiredRow = page.locator("tbody tr", { hasText: `@${newUsername}` });
    await expiredRow.getByRole("button", { name: "Perpanjang" }).click();
    const reactivateDialog = page.getByRole("dialog");
    await reactivateDialog.getByRole("button", { name: "+1 Bulan" }).click();
    await reactivateDialog.getByRole("button", { name: "Simpan Perpanjangan" }).click();
    await expect(expiredRow).toContainText("Aktif");

    await page.context().clearCookies();
    await loginAs(page, newUsername, "teman123", newStoreName);
    await page.waitForURL("**/");

    for (const route of ["/", "/pos", "/tables", "/orders", "/products", "/inventory", "/reports", "/shift", "/stores", "/settings"]) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`${route === "/" ? "/$" : route}`));
    }

    await page.goto("/inventory");
    await expect(page.getByRole("button", { name: "Sesuaikan" })).toHaveCount(0); // Empty newly-created store has 0 products yet, wait — page loads cleanly!
    await page.goto("/shift");
    await expect(page.getByRole("heading", { name: "Semua shift" })).toBeVisible();

    // Owner is blocked from /admin Back Office
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin$/);
  });
});
