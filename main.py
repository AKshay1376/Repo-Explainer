import sys

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from github_client import get_repo_info, get_tree, get_file_content
from analyzer import detect_tech_stack, summarize_folders, pick_key_files
from report_builder import generate_report, save_report
from security import sanitize_content, limit_content_size, validate_github_url

def analyze_repository(owner, repo):
    print(f"\nAnalyzing repository: {owner}/{repo}\n")

    # 1. Get repository information
    info = get_repo_info(owner, repo)

    # 2. Get complete file tree
    files = get_tree(
        owner,
        repo,
        info["default_branch"]
    )

    # 3. Detect technology stack
    tech_stack = detect_tech_stack(files)

        # 4. Summarize folders
    folder_summary = summarize_folders(files)

    MAX_FOLDER_ENTRIES = 100

    limited_folder_summary = {}

    for folder, paths in folder_summary.items():
        limited_folder_summary[folder] = paths[:MAX_FOLDER_ENTRIES]

    # 5. Pick important files
    key_files = pick_key_files(files)[:5]

    # 6. Fetch content of key files
    key_file_contents = {}

    for file in key_files:
        try:
            content = get_file_content(
                owner,
                repo,
                file,
                info["default_branch"]
            )

            sanitized_content = sanitize_content(file, content)

            if sanitized_content is not None:
                sanitized_content = limit_content_size(sanitized_content)
                key_file_contents[file] = sanitized_content
            else:
                print(f"Skipped sensitive file: {file}")

        except Exception as e:
            print(f"Could not read {file}: {e}")    
    # Display fetched file content
    print("\n=== KEY FILE CONTENT ===")

    for file, content in key_file_contents.items():
        print(f"\n--- {file} ---")
        print(content[:3000])

    # Display results
    print("=== REPOSITORY ===")
    print("Name:", info["name"])
    print("Description:", info["description"])
    print("Stars:", info["stars"])
    print("Branch:", info["default_branch"])

    print("\n=== TECH STACK ===")
    print(tech_stack)

    print("\n=== FOLDER SUMMARY ===")
    for folder, paths in folder_summary.items():
        print(f"{folder}: {paths}")

    print("\n=== KEY FILES ===")
    for file in key_files:
        print(file)

    # Return everything for the next stage
    return {
        "info": info,
        "files": files,
        "tech_stack": tech_stack,
        "folder_summary": limited_folder_summary,
        "key_files": key_files,
        "key_file_contents": key_file_contents
    }


if __name__ == "__main__":
    print("MAIN.PY IS RUNNING")

    if len(sys.argv) != 2:
        print("Usage: python main.py <github_url>")
        sys.exit(1)

    github_url = sys.argv[1]

    try:
        owner, repo = validate_github_url(github_url)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)

    result = analyze_repository(owner, repo)

    report = generate_report(
        result["info"],
        result["tech_stack"],
        result["folder_summary"],
        result["key_file_contents"]
    )

    save_report(report)