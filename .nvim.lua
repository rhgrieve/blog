vim.api.nvim_create_user_command('NewPost', function(opts)
  local slug = opts.args
  local date = os.date('%Y-%m-%d')
  local root = vim.fn.finddir('src/content', vim.fn.getcwd() .. ';')
  if root == '' then
    vim.notify('Not in the blog project', vim.log.levels.ERROR)
    return
  end
  local path = root .. '/writing/' .. slug .. '.mdx'
  vim.cmd('edit ' .. path)
  local lines = {
    '---',
    'title: ',
    'date: ' .. date,
    'summary: ',
    'tags: []',
    'draft: true',
    '---',
    '',
  }
  vim.api.nvim_buf_set_lines(0, 0, 0, false, lines)
  vim.api.nvim_win_set_cursor(0, {2, 7})
end, { nargs = 1 })
