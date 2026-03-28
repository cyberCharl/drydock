"use client"

import { Check, ChevronsUpDown } from "lucide-react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import type { Tag } from "@/lib/types"
import { cn } from "@/lib/utils"

export function TagMultiSelect({
  tags,
  selectedTagIds,
  onSelectedTagIdsChange,
}: {
  tags: Tag[]
  selectedTagIds: number[]
  onSelectedTagIdsChange: (value: number[]) => void
}) {
  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.08]"
        >
          <span className="truncate">
            {selectedTags.length > 0
              ? selectedTags.map((tag) => tag.name).join(", ")
              : "All tags"}
          </span>
          <ChevronsUpDown className="size-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] border-white/10 bg-[#09111d] p-0 text-slate-100"
      >
        <Command className="bg-transparent text-slate-100">
          <CommandInput placeholder="Filter tags..." />
          <CommandList>
            <CommandEmpty>No tags found.</CommandEmpty>
            <CommandGroup>
              {tags.map((tag) => {
                const selected = selectedTagIds.includes(tag.id)

                return (
                  <CommandItem
                    key={tag.id}
                    value={tag.name}
                    onSelect={() =>
                      onSelectedTagIdsChange(
                        selected
                          ? selectedTagIds.filter((tagId) => tagId !== tag.id)
                          : [...selectedTagIds, tag.id],
                      )
                    }
                  >
                    <Check
                      className={cn(
                        "size-4",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span>{tag.name}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
