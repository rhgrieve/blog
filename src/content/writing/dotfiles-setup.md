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

Note: [click here](#setup-guide) to jump straight to the setup guide.

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

- A bit of a unique setup, requires custom alias and `--work-tree=$HOME` flag
- Need to be mindful of .gitignore; either broad coverage or set `status.showUntrackedFiles no` (which is what I do) 
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

1. 
