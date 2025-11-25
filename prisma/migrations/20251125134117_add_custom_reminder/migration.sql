-- CreateTable
CREATE TABLE "CustomReminder" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "propertyTitle" TEXT NOT NULL,
    "counterparty" TEXT,
    "amount" DOUBLE PRECISION,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomReminder_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CustomReminder" ADD CONSTRAINT "CustomReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
