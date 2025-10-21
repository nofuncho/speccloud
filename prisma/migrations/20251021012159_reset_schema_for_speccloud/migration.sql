-- DropForeignKey
ALTER TABLE `document` DROP FOREIGN KEY `Document_folderId_fkey`;

-- AlterTable
ALTER TABLE `document` ADD COLUMN `company` VARCHAR(191) NULL,
    ADD COLUMN `role` VARCHAR(191) NULL,
    ADD COLUMN `status` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Document_updatedAt_idx` ON `Document`(`updatedAt`);

-- CreateIndex
CREATE INDEX `Folder_type_createdAt_idx` ON `Folder`(`type`, `createdAt`);

-- CreateIndex
CREATE INDEX `Template_category_isActive_idx` ON `Template`(`category`, `isActive`);

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `Folder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `document` RENAME INDEX `Document_folderId_fkey` TO `Document_folderId_idx`;

-- RenameIndex
ALTER TABLE `folder` RENAME INDEX `Folder_parentId_fkey` TO `Folder_parentId_idx`;
