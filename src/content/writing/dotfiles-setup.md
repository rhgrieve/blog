---
title: "my dotfiles setup"
date: 2026-03-26
summary: ""
tags: ["tech"]
draft: true
---

## background

I've typically only had one development machine at a time, and kind of enjoy starting from scratch as a spring cleaning exercise, so I've never taken the time to version control my dotfiles.

However, I've found myself needing to juggle a couple computers at the same time in recent years, and quickly found it to be a pain to switch between machines without my familiar setup.

So - I'm documenting the process here for me to reference in the future and in case it helps anyone else. 

If you're just here for the setup guide, [click here](#setup-guide)

### keeping track of dotfiles

There are a few different ways to keep track of dotfiles. The most common ones seem to be: 

1. Bare git repo
2. Normal git repo + symlinks
3. Dotfile manager

Let's briefly review each option, along with some pros and cons of each I found along the way. 

---

#### bare git repo

Track your home directory with a bare git repository (usually aliased to a custom command - I use `dot`), so you can commit config files in-place without symlinks or extra tooling.

##### pros

- No external dependencies, only `git`
- Files stay in their native locations, no symlinks to manage
- Full git history, branching, and remote backup

##### cons

- Not an every-day git setup, requires custom alias and `--work-tree=$HOME` flag
- Need to be mindful of `.gitignore`; either broad coverage or set `status.showUntrackedFiles no` (which is what I do) 
- Possible to accidentally commit sensitive files

---

#### normal git repo + symlinks

Store dotfiles in a regular git repo (e.g.`~/dotfiles/`) and symlink each file back to its expected location in `$HOME`.

##### pros

- Standard git workflow with no special flags or aliases
- Only files you add are tracked by default
- Easy to review and share

##### cons

- Symlinks must be created and maintained manually (or with a bootstrap script)
- Symlinks can break or behave unexpectedly with some tools
- Adding a new dotfile means copying it into the repo and creating a symlink back

---

#### dotfile manager

Use a dedicated tool that automates the symlinking ([Stow](https://tamerlan.dev/how-i-manage-my-dotfiles-using-gnu-stow/)), templating ([chezmoi](https://github.com/twpayne/chezmoi)), or wraps git with dotfile-aware features ([yadm](https://github.com/yadm-dev/yadm)).

##### pros

- Automates the tedious parts of dotfiles like secrets management and symlink creation
- Support for additional features like templates 

##### cons

- Requires an additional dependency and tool-specific knowledge
- Adds a layer of abstraction to a simple process which adds cognitive complexity

---

### my decision

Ultimately, I chose to go with a bare git repo in my home directory for the following reasons: 

- I already know git very well 
- It is ubiquitous and easily available
- It allows me to have a full understanding of my dotfile setup
- It satisfies my simplistic needs for syncing configs across machines 

## setup guide

### dotfiles bare repo setup

1. Initialize a bare repository in your home folder

```bash
git init --bare $HOME/.dotfiles.git
```

2. Create an alias to manage your dotfiles repo

```bash
alias dot='git --git-dir=$HOME/.dotfiles.git/ --work-tree=$HOME'
```

3. Ignore untracked files in the home directory

```bash
dot config --local status.showUntrackedFiles no
```
## manage homebrew installs via `Brewfile`

1. From your home directory, generate a `Brewfile` of your existing packages

```bash
brew bundle dump --force

# if you want it in a specific folder
brew bundle dump --file=~/.config/brewfile/Brewfile
```

2. Check your `Brewfile` into the dotfiles repo

```bash
dot add Brewfile
dot commit -m "add brewfile"
```

3. Run `brew bundle install` to sync your installed packages against the `Brewfile`

```bash
# if your Brewfile is not in the home directory
brew bundle install --file=~/.config/brewfile/Brewfile
```

### create bootstrap script

Here is a simple bootstrap script that you can extend as needed:

```bash
#!/bin/bash
# bootstrap.sh

# exit immediately if anything exits with non-zero status
set -e

# set up environment variables (replace with your own github details)
DOTFILES_REPO="git@github.com:rhgrieve/dotfiles.git"
DOTFILES_DIR="$HOME/.dotfiles"

# clone the bare repo
git clone --bare "$DOTFILES_REPO" "$DOTFILES_DIR"

# we don't have our alias yet, so define a function for our dotfiles repo
function dot {
  git --git-dir="$DOTFILES_DIR/" --work-tree="$HOME" "$@"
}

# try to merge locally, backing up conflicting files if needed
dot checkout 2>/dev/null || {
  echo "conflicts detected: backing up pre-existing files..."
  dot checkout 2>&1 | grep "^\s" | awk '{print $1}' | xargs -I{} sh -c 'mkdir -p "$HOME/.dotfiles-backup/$(dirname {})" && mv "$HOME/{}" "$HOME/.dotfiles-backup/{}"'
  dot checkout
}

# ensure home directory is not tracked 
dot config --local status.showUntrackedFiles no

# install homebrew if missing
which brew &>/dev/null || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# print confirmation and next steps
echo "done! next steps:"
echo "  1. source ~/.zshrc"
```


