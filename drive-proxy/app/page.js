export default function Home() {
  return (
    <>
      <h1 style={{ fontSize: "1.25rem" }}>ShopCraft Drive proxy</h1>
      <p style={{ color: "#555", maxWidth: 520 }}>
        API: <code>/api/drive-image?id=FILE_ID</code>
        <br />
        Run <code>npm run dev</code>, then set{" "}
        <code>window.SHOPCRAFT_DRIVE_PROXY = &quot;http://localhost:3000/api/drive-image&quot;</code>{" "}
        before <code>catalog-cart.js</code> on your catalog pages.
      </p>
    </>
  );
}
