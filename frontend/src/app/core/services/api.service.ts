import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Thin typed wrapper over HttpClient that prefixes the API base path. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiBase;

  get<T>(
    path: string,
    params?: Record<string, string | number | boolean>,
    headers?: Record<string, string>,
  ): Observable<T> {
    let httpParams = new HttpParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) httpParams = httpParams.set(k, String(v));
    }
    return this.http.get<T>(`${this.base}${path}`, { params: httpParams, headers });
  }

  post<T>(path: string, body: unknown, headers?: Record<string, string>): Observable<T> {
    return this.http.post<T>(`${this.base}${path}`, body, { headers });
  }

  patch<T>(path: string, body: unknown, headers?: Record<string, string>): Observable<T> {
    return this.http.patch<T>(`${this.base}${path}`, body, { headers });
  }

  put<T>(path: string, body: unknown, headers?: Record<string, string>): Observable<T> {
    return this.http.put<T>(`${this.base}${path}`, body, { headers });
  }

  delete<T>(path: string, headers?: Record<string, string>): Observable<T> {
    return this.http.delete<T>(`${this.base}${path}`, { headers });
  }
}
