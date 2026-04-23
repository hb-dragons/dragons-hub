"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dragons/ui/components/dropdown-menu";
import { Button } from "@dragons/ui/components/button";
import { ChevronDown } from "lucide-react";
import { useBoards } from "@/hooks/use-board";
import { CreateBoardDialog } from "./create-board-dialog";

export interface BoardSwitcherProps {
  currentBoardId: number;
}

export function BoardSwitcher({ currentBoardId }: BoardSwitcherProps) {
  const t = useTranslations("board");
  const router = useRouter();
  const { data: boards } = useBoards();

  const current = boards?.find((b) => b.id === currentBoardId);
  const others = (boards ?? []).filter((b) => b.id !== currentBoardId);

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            {current?.name ?? t("title")}
            <ChevronDown className="ml-2 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>{t("switcher.current")}</DropdownMenuLabel>
          {current && (
            <DropdownMenuItem disabled>{current.name}</DropdownMenuItem>
          )}
          {others.length > 0 && <DropdownMenuSeparator />}
          {others.length > 0 && (
            <DropdownMenuLabel>{t("switcher.other")}</DropdownMenuLabel>
          )}
          {others.map((b) => (
            <DropdownMenuItem
              key={b.id}
              onClick={() => router.push(`/admin/boards/${b.id}`)}
            >
              {b.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateBoardDialog
        trigger={
          <Button variant="ghost" size="sm" className="h-8 text-xs">
            {t("switcher.newBoard")}
          </Button>
        }
      />
    </div>
  );
}
