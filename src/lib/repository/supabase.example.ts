/**
 * Supabase 移行用の実装例（未使用）。
 *
 * 1. `npm i @supabase/supabase-js`
 * 2. 次のテーブルを作成:
 *      create table user_data (
 *        user_id uuid primary key references auth.users,
 *        payload jsonb not null,
 *        updated_at timestamptz not null default now()
 *      );
 *      alter table user_data enable row level security;
 *      create policy "own row" on user_data for all using (auth.uid() = user_id);
 * 3. 下のコメントを外し、src/lib/repository/index.ts で LocalStorage 実装と差し替える。
 *
 * payload は UserData をそのまま保存し、読み込み時に validateUserData で検証する。
 */

/*
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserData } from '../types';
import { validateUserData } from '../validation/userData';
import type { UserDataRepository } from './types';

export class SupabaseUserDataRepository implements UserDataRepository {
  constructor(private client: SupabaseClient, private knownHeroIds: () => string[]) {}

  async load(): Promise<UserData | null> {
    const { data, error } = await this.client.from('user_data').select('payload').maybeSingle();
    if (error || !data) return null;
    const result = validateUserData(data.payload, this.knownHeroIds());
    return result.ok ? result.data : null;
  }

  async save(payload: UserData): Promise<void> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw new Error('ログインが必要です');
    const { error } = await this.client
      .from('user_data')
      .upsert({ user_id: auth.user.id, payload, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  async clear(): Promise<void> {
    await this.client.from('user_data').delete().neq('user_id', '');
  }
}
*/
export {};
