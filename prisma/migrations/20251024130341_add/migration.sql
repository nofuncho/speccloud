-- CreateTable
CREATE TABLE `CompanyBrief` (
    `id` VARCHAR(191) NOT NULL,
    `company` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NULL,
    `blurb` VARCHAR(191) NOT NULL,
    `bullets` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CompanyBrief_updatedAt_idx`(`updatedAt`),
    UNIQUE INDEX `CompanyBrief_company_role_key`(`company`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
