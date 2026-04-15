-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sku_code" TEXT,
    "product_name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "image_url" TEXT,
    "selling_price" DECIMAL(18,4) NOT NULL,
    "opening_stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "opening_stock_unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "opening_stock_value" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "current_stock" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_public_id_key" ON "products"("public_id");

-- CreateIndex
CREATE INDEX "products_user_id_idx" ON "products"("user_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
