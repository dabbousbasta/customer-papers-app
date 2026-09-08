import { supabase } from './supabase'

export async function logActivity({
  actionType,
  entityType,
  entityId = null,
  customerId = null,
  paperId = null,
  summary,
  details = {}
}) {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser()

  if (userError) {
    throw userError
  }

  if (!user) {
    return null
  }

  const { data, error } = await supabase
    .from('activity_log')
    .insert({
      user_id: user.id,
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId,
      customer_id: customerId,
      paper_id: paperId,
      summary,
      details
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function getActivitiesForDate(dateValue) {
  const start = new Date(`${dateValue}T00:00:00`)
  const end = new Date(`${dateValue}T23:59:59.999`)

  const { data, error } = await supabase
    .from('activity_log')
    .select(`
      *,
      profiles (
        display_name,
        email
      ),
      customers (
        id,
        name
      ),
      papers (
        id,
        paper_date,
        customer_id
      )
    `)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', {
      ascending: false
    })

  if (error) {
    throw error
  }

  return data || []
}

export function getActivityUserName(activity) {
  if (activity.profiles?.display_name) {
    return activity.profiles.display_name
  }

  if (activity.profiles?.email) {
    return activity.profiles.email
  }

  return 'مستخدم غير معروف'
}