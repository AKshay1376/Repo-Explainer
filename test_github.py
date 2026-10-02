from github_client import get_repo_info, get_tree
from analyzer import (
    detect_tech_stack,
    summarize_folders,
    pick_key_files,
)


owner = "AKshay1376"
repo = "plant-disease-detector"

info = get_repo_info(owner, repo)

files = get_tree(
    owner,
    repo,
    info["default_branch"]
)

print("\n=== TECH STACK ===")

stack = detect_tech_stack(files)

print(stack)


print("\n=== FOLDER SUMMARY ===")

folders = summarize_folders(files)

for folder, folder_files in folders.items():
    print(folder, ":", folder_files)


print("\n=== KEY FILES ===")

key_files = pick_key_files(files)

for file in key_files:
    print(file)