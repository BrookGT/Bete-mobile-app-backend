-- CreateTable
CREATE TABLE "RentalInvite" (
    "id" SERIAL NOT NULL,
    "rentalId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "inviterId" INTEGER NOT NULL,
    "inviteeEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedBy" INTEGER,

    CONSTRAINT "RentalInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RentalInvite_code_key" ON "RentalInvite"("code");

-- AddForeignKey
ALTER TABLE "RentalInvite" ADD CONSTRAINT "RentalInvite_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
